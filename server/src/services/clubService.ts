import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../config/cosmos';

interface AuthSocket extends Socket {
  userId?: string;
}

// Club levels based on totalDonations thresholds
const CLUB_LEVEL_THRESHOLDS = [0, 10_000, 100_000, 1_000_000, 10_000_000];

function getClubLevel(totalDonations: number): number {
  for (let i = CLUB_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalDonations >= CLUB_LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export class ClubService {
  // ──────────────────── Create Club ────────────────────
  async createClub(
    ownerId: string,
    name: string,
    description: string,
    avatarUrl?: string,
    settings?: { minVipLevel?: number; isPublic?: boolean; maxMembers?: number },
  ) {
    const dataContainer = getContainer('data');
    const usersContainer = getContainer('users');

    // Limit: max 1 club owned per user
    const { resources: owned } = await dataContainer.items
      .query({
        query: `SELECT c.id FROM c WHERE c.docType = 'club_member' AND c.memberUserId = @uid AND c.role = 'owner'`,
        parameters: [{ name: '@uid', value: ownerId }],
      })
      .fetchAll();

    if (owned.length > 0) {
      throw { status: 409, message: 'You already own a club' };
    }

    // Check join limit for owner too
    const { resources: memberships } = await dataContainer.items
      .query({
        query: `SELECT c.id FROM c WHERE c.docType = 'club_member' AND c.memberUserId = @uid AND c.status = 'active'`,
        parameters: [{ name: '@uid', value: ownerId }],
      })
      .fetchAll();

    if (memberships.length >= 5) {
      throw { status: 400, message: 'You have reached the maximum of 5 clubs' };
    }

    const clubId = `club_${uuidv4()}`;
    const now = new Date().toISOString();

    // Club doc — stored in data container with userId = clubId (partition key)
    const clubDoc = {
      id: clubId,
      userId: clubId, // partition key
      docType: 'club',
      name,
      description,
      avatarUrl: avatarUrl || '',
      ownerId,
      totalDonations: 0,
      memberCount: 1,
      settings: {
        minVipLevel: settings?.minVipLevel ?? 0,
        isPublic: settings?.isPublic ?? true,
        maxMembers: settings?.maxMembers ?? 50,
      },
      createdAt: now,
      updatedAt: now,
    };

    await dataContainer.items.create(clubDoc);

    // Owner membership doc
    const { resource: ownerUser } = await usersContainer.item(ownerId, ownerId).read();
    const memberDoc = {
      id: `cm_${clubId}_${ownerId}`,
      userId: clubId, // partition key = clubId
      docType: 'club_member',
      clubId,
      memberUserId: ownerId,
      displayName: ownerUser?.displayName ?? 'Unknown',
      role: 'owner',
      status: 'active',
      joinedAt: now,
    };

    await dataContainer.items.create(memberDoc);

    return { ...clubDoc, level: 1 };
  }

  // ──────────────────── Get Club Details ────────────────────
  async getClub(clubId: string) {
    const dataContainer = getContainer('data');
    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (!club || club.docType !== 'club') {
      throw { status: 404, message: 'Club not found' };
    }

    const { resources: members } = await dataContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.docType = 'club_member' AND c.clubId = @clubId AND c.status = 'active'`,
        parameters: [{ name: '@clubId', value: clubId }],
      })
      .fetchAll();

    return {
      ...club,
      level: getClubLevel(club.totalDonations),
      members,
    };
  }

  // ──────────────────── Search Clubs ────────────────────
  async searchClubs(searchName?: string, offset = 0, limit = 20) {
    const dataContainer = getContainer('data');

    let query: string;
    let parameters: { name: string; value: any }[];

    if (searchName) {
      query = `SELECT * FROM c WHERE c.docType = 'club' AND CONTAINS(LOWER(c.name), @name) ORDER BY c.memberCount DESC OFFSET @offset LIMIT @limit`;
      parameters = [
        { name: '@name', value: searchName.toLowerCase() },
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ];
    } else {
      query = `SELECT * FROM c WHERE c.docType = 'club' ORDER BY c.memberCount DESC OFFSET @offset LIMIT @limit`;
      parameters = [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ];
    }

    const { resources } = await dataContainer.items
      .query({ query, parameters }, { enableCrossPartitionQuery: true })
      .fetchAll();

    return resources.map((c: any) => ({ ...c, level: getClubLevel(c.totalDonations) }));
  }

  // ──────────────────── Join Club ────────────────────
  async joinClub(clubId: string, userId: string) {
    const dataContainer = getContainer('data');
    const usersContainer = getContainer('users');

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (!club || club.docType !== 'club') {
      throw { status: 404, message: 'Club not found' };
    }

    // Check existing membership
    const memberId = `cm_${clubId}_${userId}`;
    const { resource: existing } = await dataContainer.item(memberId, clubId).read();
    if (existing) {
      if (existing.status === 'active') throw { status: 409, message: 'Already a member' };
      if (existing.status === 'pending') throw { status: 409, message: 'Join request already pending' };
      if (existing.status === 'banned') throw { status: 403, message: 'You are banned from this club' };
    }

    // Check join limit
    const { resources: memberships } = await dataContainer.items
      .query({
        query: `SELECT c.id FROM c WHERE c.docType = 'club_member' AND c.memberUserId = @uid AND c.status = 'active'`,
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();

    if (memberships.length >= 5) {
      throw { status: 400, message: 'You have reached the maximum of 5 clubs' };
    }

    // Check max members
    if (club.settings.isPublic && club.memberCount >= club.settings.maxMembers) {
      throw { status: 400, message: 'Club is full' };
    }

    const { resource: user } = await usersContainer.item(userId, userId).read();
    const now = new Date().toISOString();
    const status = club.settings.isPublic ? 'active' : 'pending';

    const memberDoc = {
      id: memberId,
      userId: clubId, // partition key
      docType: 'club_member',
      clubId,
      memberUserId: userId,
      displayName: user?.displayName ?? 'Unknown',
      role: 'member',
      status,
      joinedAt: now,
    };

    await dataContainer.items.create(memberDoc);

    if (status === 'active') {
      club.memberCount = (club.memberCount || 0) + 1;
      club.updatedAt = now;
      await dataContainer.item(clubId, clubId).replace(club);
    }

    return { status, message: status === 'active' ? 'Joined club' : 'Join request sent' };
  }

  // ──────────────────── Leave Club ────────────────────
  async leaveClub(clubId: string, userId: string) {
    const dataContainer = getContainer('data');

    const memberId = `cm_${clubId}_${userId}`;
    const { resource: member } = await dataContainer.item(memberId, clubId).read();
    if (!member || member.status !== 'active') {
      throw { status: 404, message: 'Not a member of this club' };
    }
    if (member.role === 'owner') {
      throw { status: 400, message: 'Owner cannot leave. Transfer ownership or delete the club.' };
    }

    await dataContainer.item(memberId, clubId).delete();

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (club) {
      club.memberCount = Math.max(0, (club.memberCount || 1) - 1);
      club.updatedAt = new Date().toISOString();
      await dataContainer.item(clubId, clubId).replace(club);
    }

    return { message: 'Left club' };
  }

  // ──────────────────── Approve Join Request ────────────────────
  async approveJoin(clubId: string, requesterId: string, approverId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, approverId, ['owner', 'admin']);

    const memberId = `cm_${clubId}_${requesterId}`;
    const { resource: member } = await dataContainer.item(memberId, clubId).read();
    if (!member || member.status !== 'pending') {
      throw { status: 404, message: 'No pending request found for this user' };
    }

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (club && club.memberCount >= club.settings.maxMembers) {
      throw { status: 400, message: 'Club is full' };
    }

    member.status = 'active';
    member.joinedAt = new Date().toISOString();
    await dataContainer.item(memberId, clubId).replace(member);

    if (club) {
      club.memberCount = (club.memberCount || 0) + 1;
      club.updatedAt = new Date().toISOString();
      await dataContainer.item(clubId, clubId).replace(club);
    }

    return { message: 'Member approved' };
  }

  // ──────────────────── Invite Friend ────────────────────
  async inviteFriend(clubId: string, inviterId: string, friendId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, inviterId, ['owner', 'admin', 'member']);

    // Check if already a member
    const memberId = `cm_${clubId}_${friendId}`;
    const { resource: existing } = await dataContainer.item(memberId, clubId).read();
    if (existing && (existing.status === 'active' || existing.status === 'pending')) {
      throw { status: 409, message: 'User is already a member or has a pending request' };
    }
    if (existing && existing.status === 'banned') {
      throw { status: 403, message: 'User is banned from this club' };
    }

    const inviteDoc = {
      id: `cinv_${clubId}_${friendId}_${Date.now()}`,
      userId: clubId, // partition key
      docType: 'club_invite',
      clubId,
      inviterId,
      inviteeId: friendId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await dataContainer.items.create(inviteDoc);
    return { message: 'Invitation sent' };
  }

  // ──────────────────── Kick Member ────────────────────
  async kickMember(clubId: string, kickerId: string, targetId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, kickerId, ['owner', 'admin']);

    const memberId = `cm_${clubId}_${targetId}`;
    const { resource: target } = await dataContainer.item(memberId, clubId).read();
    if (!target || target.status !== 'active') {
      throw { status: 404, message: 'Member not found' };
    }
    if (target.role === 'owner') {
      throw { status: 403, message: 'Cannot kick the owner' };
    }
    // Admins cannot kick other admins
    if (target.role === 'admin') {
      await this.requireRole(clubId, kickerId, ['owner']);
    }

    await dataContainer.item(memberId, clubId).delete();

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (club) {
      club.memberCount = Math.max(0, (club.memberCount || 1) - 1);
      club.updatedAt = new Date().toISOString();
      await dataContainer.item(clubId, clubId).replace(club);
    }

    return { message: 'Member kicked' };
  }

  // ──────────────────── Ban Member ────────────────────
  async banMember(clubId: string, ownerId: string, targetId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, ownerId, ['owner']);

    const memberId = `cm_${clubId}_${targetId}`;
    const { resource: target } = await dataContainer.item(memberId, clubId).read();
    if (target && target.role === 'owner') {
      throw { status: 403, message: 'Cannot ban the owner' };
    }

    const now = new Date().toISOString();
    if (target) {
      target.status = 'banned';
      target.bannedAt = now;
      await dataContainer.item(memberId, clubId).replace(target);
    } else {
      // Create a banned record even if not currently a member
      await dataContainer.items.create({
        id: memberId,
        userId: clubId,
        docType: 'club_member',
        clubId,
        memberUserId: targetId,
        displayName: '',
        role: 'member',
        status: 'banned',
        bannedAt: now,
      });
    }

    // Decrement member count if they were active
    if (target && target.status === 'active') {
      const { resource: club } = await dataContainer.item(clubId, clubId).read();
      if (club) {
        club.memberCount = Math.max(0, (club.memberCount || 1) - 1);
        club.updatedAt = now;
        await dataContainer.item(clubId, clubId).replace(club);
      }
    }

    return { message: 'Member banned' };
  }

  // ──────────────────── Promote to Admin ────────────────────
  async promoteMember(clubId: string, promoterId: string, targetId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, promoterId, ['owner']);

    const memberId = `cm_${clubId}_${targetId}`;
    const { resource: target } = await dataContainer.item(memberId, clubId).read();
    if (!target || target.status !== 'active') {
      throw { status: 404, message: 'Member not found' };
    }
    if (target.role === 'owner') {
      throw { status: 400, message: 'Cannot promote the owner' };
    }
    if (target.role === 'admin') {
      throw { status: 400, message: 'Already an admin' };
    }

    target.role = 'admin';
    await dataContainer.item(memberId, clubId).replace(target);
    return { message: 'Member promoted to admin' };
  }

  // ──────────────────── Donate Chips ────────────────────
  async donateChips(clubId: string, userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw { status: 400, message: 'Amount must be a positive integer' };
    }

    const dataContainer = getContainer('data');
    const usersContainer = getContainer('users');

    await this.requireRole(clubId, userId, ['owner', 'admin', 'member']);

    // Deduct chips from user
    const { resource: user } = await usersContainer.item(userId, userId).read();
    if (!user) throw { status: 404, message: 'User not found' };
    if ((user.chips || 0) < amount) {
      throw { status: 400, message: 'Insufficient chips' };
    }

    user.chips = (user.chips || 0) - amount;
    await usersContainer.item(userId, userId).replace(user);

    // Update club totalDonations
    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (!club) throw { status: 404, message: 'Club not found' };
    club.totalDonations = (club.totalDonations || 0) + amount;
    club.updatedAt = new Date().toISOString();
    await dataContainer.item(clubId, clubId).replace(club);

    // Create donation record
    const donationDoc = {
      id: `cdon_${clubId}_${userId}_${Date.now()}`,
      userId: clubId, // partition key
      docType: 'club_donation',
      clubId,
      donorUserId: userId,
      donorDisplayName: user.displayName ?? 'Unknown',
      amount,
      createdAt: new Date().toISOString(),
    };

    await dataContainer.items.create(donationDoc);

    return {
      message: 'Donation successful',
      amount,
      newBalance: user.chips,
      clubTotalDonations: club.totalDonations,
      clubLevel: getClubLevel(club.totalDonations),
    };
  }

  // ──────────────────── Rankings ────────────────────
  async getRankings(clubId: string) {
    const dataContainer = getContainer('data');

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (!club || club.docType !== 'club') {
      throw { status: 404, message: 'Club not found' };
    }

    const { resources: donations } = await dataContainer.items
      .query({
        query: `SELECT c.donorUserId, c.donorDisplayName, SUM(c.amount) AS totalDonated
                FROM c WHERE c.docType = 'club_donation' AND c.clubId = @clubId
                GROUP BY c.donorUserId, c.donorDisplayName`,
        parameters: [{ name: '@clubId', value: clubId }],
      })
      .fetchAll();

    donations.sort((a: any, b: any) => (b.totalDonated || 0) - (a.totalDonated || 0));
    return donations;
  }

  // ──────────────────── Club Chat ────────────────────
  async getChatMessages(clubId: string, limit = 50) {
    const dataContainer = getContainer('data');

    const { resources } = await dataContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.docType = 'club_chat' AND c.clubId = @clubId ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit`,
        parameters: [
          { name: '@clubId', value: clubId },
          { name: '@limit', value: limit },
        ],
      })
      .fetchAll();

    return resources.reverse();
  }

  async sendChatMessage(clubId: string, userId: string, message: string) {
    const dataContainer = getContainer('data');
    const usersContainer = getContainer('users');

    await this.requireRole(clubId, userId, ['owner', 'admin', 'member']);

    const { resource: user } = await usersContainer.item(userId, userId).read();
    const now = new Date().toISOString();

    const chatDoc = {
      id: `cchat_${clubId}_${Date.now()}_${uuidv4().slice(0, 8)}`,
      userId: clubId, // partition key
      docType: 'club_chat',
      clubId,
      senderUserId: userId,
      senderDisplayName: user?.displayName ?? 'Unknown',
      message,
      createdAt: now,
    };

    await dataContainer.items.create(chatDoc);
    return chatDoc;
  }

  // ──────────────────── Update Settings ────────────────────
  async updateSettings(
    clubId: string,
    ownerId: string,
    updates: { name?: string; description?: string; avatarUrl?: string; minVipLevel?: number; isPublic?: boolean; maxMembers?: number },
  ) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, ownerId, ['owner']);

    const { resource: club } = await dataContainer.item(clubId, clubId).read();
    if (!club || club.docType !== 'club') {
      throw { status: 404, message: 'Club not found' };
    }

    if (updates.name !== undefined) club.name = updates.name;
    if (updates.description !== undefined) club.description = updates.description;
    if (updates.avatarUrl !== undefined) club.avatarUrl = updates.avatarUrl;
    if (updates.minVipLevel !== undefined) club.settings.minVipLevel = updates.minVipLevel;
    if (updates.isPublic !== undefined) club.settings.isPublic = updates.isPublic;
    if (updates.maxMembers !== undefined) club.settings.maxMembers = updates.maxMembers;
    club.updatedAt = new Date().toISOString();

    await dataContainer.item(clubId, clubId).replace(club);
    return { ...club, level: getClubLevel(club.totalDonations) };
  }

  // ──────────────────── Delete Club ────────────────────
  async deleteClub(clubId: string, ownerId: string) {
    const dataContainer = getContainer('data');
    await this.requireRole(clubId, ownerId, ['owner']);

    // Delete all club-related docs in the partition
    const { resources: docs } = await dataContainer.items
      .query({
        query: `SELECT c.id FROM c WHERE c.userId = @clubId`,
        parameters: [{ name: '@clubId', value: clubId }],
      })
      .fetchAll();

    for (const doc of docs) {
      await dataContainer.item(doc.id, clubId).delete();
    }

    return { message: 'Club deleted' };
  }

  // ──────────────────── Socket.IO ────────────────────
  handleConnection(socket: AuthSocket, io: SocketIOServer): void {
    socket.on('club:join_chat', (data: { clubId: string }) => {
      if (data?.clubId) {
        socket.join(`club:${data.clubId}`);
      }
    });

    socket.on('club:leave_chat', (data: { clubId: string }) => {
      if (data?.clubId) {
        socket.leave(`club:${data.clubId}`);
      }
    });

    socket.on('club:chat', async (data: { clubId: string; message: string }) => {
      if (!socket.userId || !data?.clubId || !data?.message) return;

      try {
        const chatDoc = await this.sendChatMessage(data.clubId, socket.userId, data.message);
        io.to(`club:${data.clubId}`).emit('club:chat', chatDoc);
      } catch (err) {
        socket.emit('club:error', { message: (err as any).message || 'Failed to send message' });
      }
    });
  }

  // ──────────────────── Helpers ────────────────────
  private async requireRole(clubId: string, userId: string, roles: string[]): Promise<void> {
    const dataContainer = getContainer('data');
    const memberId = `cm_${clubId}_${userId}`;
    const { resource: member } = await dataContainer.item(memberId, clubId).read();

    if (!member || member.status !== 'active') {
      throw { status: 403, message: 'Not a member of this club' };
    }
    if (!roles.includes(member.role)) {
      throw { status: 403, message: `Requires role: ${roles.join(' or ')}` };
    }
  }
}
