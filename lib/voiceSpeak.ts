import { Platform } from 'react-native';
import { releaseBluetoothVoiceRoute, speakInVoiceChannel } from './bluetoothVoiceRoute';
import { resumeHeadsetSession } from './headsetRemote';

let holdSpeech = false;
let queuedSpeech: string | null = null;

function endVoicePlayback(): void {
  if (Platform.OS === 'android') {
    try { releaseBluetoothVoiceRoute(); } catch {}
  }
  setTimeout(() => {
    try { resumeHeadsetSession(); } catch {}
  }, 60);
}

/** iOS·웹 폴백. Android 복명복창은 speakInVoiceChannel 을 쓴다. */
export function speakExpoKorean(text: string, rate = 1.0): Promise<void> {
  if (!text || Platform.OS === 'web') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      const Speech = require('expo-speech');
      try { Speech.stop(); } catch {}
      Speech.speak(text, {
        language: 'ko-KR',
        rate,
        onDone: done,
        onStopped: done,
        onError: done,
      });
      setTimeout(done, Math.min(9000, Math.max(1800, text.length * 240 + 700)));
    } catch (e) {
      console.warn('[TTS] speak skip', e);
      done();
    }
  });
}

/** Android 는 통화 채널 TTS, 그 외에는 expo-speech. 재생이 끝나면 통화를 닫는다. */
export async function speakFeedback(text: string, rate = 1.0): Promise<void> {
  if (!text) return;
  try {
    if (Platform.OS === 'android') {
      try {
        await speakInVoiceChannel(text);
      } catch (e) {
        console.warn('[TTS] speakInVoiceChannel failed, fallback to ExpoSpeech', e);
        await speakExpoKorean(text, rate);
      }
    } else {
      await speakExpoKorean(text, rate);
    }
  } catch (e) {
    console.warn('[TTS] speak skip', e);
  } finally {
    endVoicePlayback();
  }
}

/** 마이크가 닫히기 전에는 안내 음성을 쌓아 두고, 닫힌 뒤에 재생한다. */
export function holdSpeechForMicRelease(hold: boolean): void {
  holdSpeech = hold;
  if (hold || !queuedSpeech) return;
  const text = queuedSpeech;
  queuedSpeech = null;
  speakKorean(text);
}

export function speakKorean(text: string): void {
  if (!text) return;
  if (holdSpeech) {
    queuedSpeech = text;
    return;
  }
  void speakFeedback(text, 1.02);
}

/** 마이크를 닫고 재생 모드로 넘어간 뒤 다시 말해 달라는 안내만 낸다. */
export function speakRetryAfterChannelSwitch(): void {
  void speakFeedback('다시 말씀해주세요', 1.0);
}

/** 인식 실패 안내를 통화 채널로 읽는다. */
export function speakVoiceRetry(): void {
  void speakFeedback('다시 말씀해주세요', 1.0);
}