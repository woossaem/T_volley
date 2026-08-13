import { Platform, LogBox } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Expo Go에서 발생하는 알림 터미널 경고 차단
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// 동적 세이프 모드 로딩
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
} catch (e) {
  console.log('Notifications 세이프 모드 활성화');
}

// 푸시 토큰 등록
export async function registerForPushNotificationsAsync(userId: string) {
  if (isExpoGo && Platform.OS === 'android') {
    return;
  }

  if (!Notifications) return;

  try {
    const Device = require('expo-device');
    if (!Device.isDevice) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    if (token && userId) {
      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });
    }
  } catch (error) {
    console.log('푸시 토큰 스킵');
  }
}

// 푸시 서버 발송
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data = {}) {
  if (!expoPushToken) return;
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error('푸시 발송 실패:', error);
  }
}

// 특정 유저 인앱 종 알림 + 푸시 발송
export async function sendNotificationToUser(userId: string, title: string, message: string) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      is_read: false,
    });

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.push_token) {
      await sendPushNotification(profile.push_token, title, message);
    }
  } catch (err) {
    console.error('유저 알림 발송 실패:', err);
  }
}

// 팀 전체 알림 전송
export async function sendNotificationToTeam(teamName: string, title: string, message: string, excludeUserId?: string) {
  try {
    const { data: teamData } = await supabase
      .from('teams')
      .select('id')
      .eq('name', teamName)
      .maybeSingle();

    if (!teamData) return;

    const { data: members } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamData.id)
      .eq('is_active', true);

    if (!members || members.length === 0) return;

    for (const m of members) {
      if (excludeUserId && m.user_id === excludeUserId) continue;
      await sendNotificationToUser(m.user_id, title, message);
    }
  } catch (err) {
    console.error('팀 알림 발송 실패:', err);
  }
}