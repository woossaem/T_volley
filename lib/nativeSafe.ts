import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/** 웹/iOS 네이티브 모듈 예외를 삼켜 진입 크래시를 막는다. */
export async function safeNativeCall(action: () => Promise<any>): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await action();
  } catch (e) {
    console.warn('[Native Safe Guard] bypassed:', e);
  }
}

/** iOS Yoga: NaN/undefined 가 style 숫자에 들어가면 크래시 */
export function safeInset(value: number | null | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : fallback;
}

export function safeStyleNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : fallback;
}

const SHADOW_OFFSET_ZERO = { width: 0, height: 0 } as const;
const SHADOW_OFFSET_SOFT = { width: 0, height: 2 } as const;

export const IOS_SHADOW_NONE = {
  shadowColor: '#000000',
  shadowOffset: SHADOW_OFFSET_ZERO,
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
} as const;

export const IOS_SHADOW_SOFT = {
  shadowColor: '#000000',
  shadowOffset: SHADOW_OFFSET_SOFT,
  shadowOpacity: 0.25,
  shadowRadius: 3,
  elevation: 2,
} as const;

export const IOS_SHADOW_GLOW = {
  shadowColor: '#38BDF8',
  shadowOffset: SHADOW_OFFSET_ZERO,
  shadowOpacity: 0.9,
  shadowRadius: 8,
  elevation: 8,
} as const;

export async function safeLockLandscape(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch (e) {
    console.warn('[Native Safe Guard] landscape lock bypassed:', e);
  } finally {
    // 락 실패가 라우터 이탈로 번지지 않게 여기서 끝낸다.
  }
}

export async function safeLockPortrait(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
  } catch (e) {
    console.warn('[Native Safe Guard] portrait lock bypassed:', e);
  } finally {
    // 복구 실패여도 호출부 화면을 유지한다.
  }
}

export async function safeUnlockOrientation(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.unlockAsync();
  } catch (e) {
    console.warn('[Native Safe Guard] orientation unlock bypassed:', e);
  } finally {
    // no-op
  }
}

/** expo-haptics 네이티브 모듈 예외를 삼킨다. 호출부가 없어도 안전하다. */
export async function safeHapticImpact(): Promise<void> {
  await safeNativeCall(async () => {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });
}

/**
 * expo-av 는 현재 의존성에 없다. 정적 import 하면 번들이 깨지므로
 * 호출만 감싼다. 나중에 사운드를 붙일 때도 이 함수를 경유한다.
 */
export async function safePlaySound(): Promise<void> {
  try {
    return;
  } catch {
    // no-op
  }
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
