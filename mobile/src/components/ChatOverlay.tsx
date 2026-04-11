import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { colors, fonts, spacing, borderRadius } from '../theme';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'emoji';
  timestamp: string;
}

const QUICK_EMOJIS = ['👍', '😂', '😢', '😡', '👏', '🔥', '👑', '💀', '🎉', '❤️'];

interface Props {
  messages: Message[];
  currentUserId: string;
  onSendMessage: (content: string, type: 'text' | 'emoji') => void;
}

export default function ChatOverlay({ messages, currentUserId, onSendMessage }: Props) {
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text.trim(), 'text');
    setText('');
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === currentUserId;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
        {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
        <Text style={[styles.messageText, item.type === 'emoji' && styles.emojiMessage]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        style={styles.messageList}
      />

      {/* Quick emojis */}
      {showEmojis && (
        <View style={styles.emojiBar}>
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.emojiBtn}
              onPress={() => onSendMessage(emoji, 'emoji')}
            >
              <Text style={styles.emojiBtnText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity onPress={() => setShowEmojis(!showEmojis)} style={styles.emojiToggle}>
          <Text style={styles.emojiToggleText}>😊</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Say something..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: 300, backgroundColor: 'rgba(13,17,23,0.9)',
    borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg,
  },
  messageList: { maxHeight: 180, paddingHorizontal: spacing.md },
  messageBubble: {
    maxWidth: '75%', borderRadius: borderRadius.md,
    padding: spacing.sm, marginVertical: 2,
  },
  myMessage: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  otherMessage: { alignSelf: 'flex-start', backgroundColor: colors.surfaceLight },
  senderName: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: 2 },
  messageText: { color: colors.text, fontSize: fonts.sizes.md },
  emojiMessage: { fontSize: 28 },
  emojiBar: {
    flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, justifyContent: 'space-around',
  },
  emojiBtn: { padding: spacing.xs },
  emojiBtnText: { fontSize: 24 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  emojiToggle: { padding: spacing.sm },
  emojiToggleText: { fontSize: 22 },
  input: {
    flex: 1, backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, color: colors.text, fontSize: fonts.sizes.md,
  },
  sendBtn: {
    backgroundColor: colors.primary, width: 36, height: 36,
    borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.sm,
  },
  sendBtnText: { color: colors.background, fontSize: 16 },
});
