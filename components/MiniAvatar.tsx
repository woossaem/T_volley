import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type MiniAvatarProps = {
  uri?: string | null;
  emoji?: string | null;
  size?: number;
};

/** 카카오톡 프로필처럼 사진 또는 이모티콘을 원형으로 보여 준다. */
export default function MiniAvatar({ uri, emoji, size = 36 }: MiniAvatarProps) {
  const icon = emoji && emoji.trim() ? emoji : '🏐';
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.52) }}>{icon}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
});
