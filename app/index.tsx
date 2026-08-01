import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

export default function Index() {
  const { session, loading } = useAuth();

  // 1. 인증 정보를 불러오는 중일 때는 로딩 스피너 표시
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // 2. 이미 로그인되어 있다면 안전하게 메인 홈(/home)으로 이동
  if (session) {
    return <Redirect href="/home" />;
  }

  // 3. 비로그인 상태라면 안전하게 로그인 화면(/login)으로 이동
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
});