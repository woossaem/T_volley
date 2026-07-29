import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>티볼리 (Tivoli)</Text>
        <Text style={styles.subtitle}>
          최고의 배구 커뮤니티{'\n'}by Rudolfuu
        </Text>
        <Text style={styles.welcome}>
          환영합니다. 초등교사 배구 커뮤니티 티볼리입니다.
        </Text>
        <Text style={styles.hint}>1단계: 개발 환경 세팅 완료 ✓</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E3A5F',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
  },
  welcome: {
    fontSize: 18,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 24,
  },
  hint: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '600',
  },
});
