import { Platform } from 'react-native';
import { ensureAndroidVoicePermissions, prepareBluetoothVoiceRoute, releaseBluetoothVoiceRoute, speakInVoiceChannel } from './bluetoothVoiceRoute';
import { resumeHeadsetSession } from './headsetRemote';
import { speakExpoKorean } from './voiceSpeak';

const IOS_VOICE_CATEGORY = {
  category: 'playAndRecord',
  categoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'defaultToSpeaker'],
  mode: 'default',
};

const SPEAK_DELAY_MS = 300;
const LISTEN_TIMEOUT_MS = 6000; // ★ 테스트를 위해 3.5초 -> 6초로 연장
const RETRY_PHRASE = '다시 말씀해주세요';

export type AudioMachineState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';

type SpeechModule = {
  start: (options: Record<string, unknown>) => void | Promise<void>;
  stop?: () => void | Promise<void>;
  cancel?: () => void | Promise<void>;
  addListener: (event: string, listener: (event: any) => void) => { remove: () => void };
  requestPermissionsAsync: () => Promise<{ granted?: boolean }>;
};

type SpeechSubscription = { remove: () => void };

const NEXT_STATE: Record<AudioMachineState, AudioMachineState[]> = {
  IDLE: ['LISTENING'],
  LISTENING: ['PROCESSING', 'IDLE'],
  PROCESSING: ['SPEAKING', 'IDLE'],
  SPEAKING: ['IDLE'],
};

let audioState: AudioMachineState = 'IDLE';
let generation = 0;
let activeSubs: SpeechSubscription[] = [];
const stateListeners = new Set<(state: AudioMachineState) => void>();

function loadSpeechModule(): SpeechModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule;
  } catch (e) {
    console.warn('[Voice] 모듈 로드 실패', e);
    return null;
  }
}

const Voice = {
  async stop(): Promise<void> {
    const module = loadSpeechModule();
    if (!module?.stop) return;
    await Promise.resolve(module.stop()).catch(() => {});
  },
  async cancel(): Promise<void> {
    const module = loadSpeechModule();
    if (!module?.cancel) return;
    await Promise.resolve(module.cancel()).catch(() => {});
  },
};

export function getAudioState(): AudioMachineState {
  return audioState;
}

export function subscribeAudioState(listener: (state: AudioMachineState) => void): () => void {
  stateListeners.add(listener);
  try { listener(audioState); } catch {}
  return () => {
    stateListeners.delete(listener);
  };
}

function emitState(next: AudioMachineState): void {
  audioState = next;
  stateListeners.forEach((listener) => {
    try { listener(next); } catch {}
  });
}

function enterState(next: AudioMachineState): boolean {
  if (audioState === next) return true;
  if (!NEXT_STATE[audioState].includes(next)) return false;
  emitState(next);
  return true;
}

function forceIdle(): void {
  if (audioState === 'IDLE') return;
  emitState('IDLE');
}

function detachActiveSubs(): void {
  const subs = activeSubs;
  activeSubs = [];
  subs.forEach((sub) => {
    try { sub.remove(); } catch {}
  });
}

async function haltMicrophone(): Promise<void> {
  try {
    await Voice.stop().catch(() => {});
  } catch {}
  try {
    await Voice.cancel().catch(() => {});
  } catch {}
}

async function playConfirm(text: string, withRate: boolean): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await speakInVoiceChannel(text);
      return;
    } catch (e) {
      console.warn('[TTS] speakInVoiceChannel failed, fallback to ExpoSpeech', e);
    }
  }
  await speakExpoKorean(text, withRate ? 1.0 : 1.0);
}

function finishVoicePlayback(session: number): void {
  if (Platform.OS === 'android') {
    try { releaseBluetoothVoiceRoute(); } catch {}
  }
  if (session !== generation) return;
  setTimeout(() => {
    if (session !== generation) return;
    try { resumeHeadsetSession(); } catch {}
  }, 60);
}

function speakThenIdle(session: number, text: string, withRate: boolean): void {
  setTimeout(() => {
    if (session !== generation) return;
    if (!enterState('SPEAKING')) return;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      finishVoicePlayback(session);
      if (session !== generation) return;
      forceIdle();
    };
    const timer = setTimeout(finish, 16000);
    void playConfirm(text, withRate).finally(() => {
      clearTimeout(timer);
      finish();
    });
  }, SPEAK_DELAY_MS);
}

export async function releaseVoiceEngine(): Promise<void> {
  generation += 1;
  detachActiveSubs();
  try {
    await haltMicrophone();
  } catch {}
  try {
    releaseBluetoothVoiceRoute();
  } catch {}
  if (Platform.OS !== 'android') {
    try {
      const Speech = require('expo-speech');
      Speech.stop();
    } catch {}
  }
  forceIdle();
}

export async function startListening(
  onFinal: (transcript: string) => void | Promise<void | string | null>,
  onError?: (message: string) => void,
  options?: { listenMs?: number },
): Promise<() => void> {
  if (Platform.OS === 'web') {
    onError?.('웹에서는 이어폰 음성 기록을 지원하지 않습니다.');
    return () => {};
  }
  if (audioState !== 'IDLE') {
    return () => {};
  }

  const ExpoSpeechRecognitionModule = loadSpeechModule();
  if (!ExpoSpeechRecognitionModule) {
    onError?.('음성 인식 모듈을 불러오지 못했습니다.');
    return () => {};
  }

  try {
    const voiceAccess = await ensureAndroidVoicePermissions();
    if (!voiceAccess.microphone) {
      onError?.('블루투스 이어폰 마이크 사용을 위해 권한을 허용해주세요');
      return () => {};
    }
  } catch {
    onError?.('마이크 권한을 확인하지 못했습니다.');
    return () => {};
  }

  try {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission?.granted) {
      onError?.('마이크 또는 음성 인식 권한이 없습니다.');
      return () => {};
    }
  } catch {
    onError?.('음성 인식 권한을 확인하지 못했습니다.');
    return () => {};
  }

  if (audioState !== 'IDLE') return () => {};

  if (Platform.OS === 'android') {
    try {
      await prepareBluetoothVoiceRoute();
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e) {
      console.warn('[Voice] prepareBluetoothVoiceRoute failed', e);
    }
  }

  const session = generation + 1;
  generation = session;
  const alive = () => session === generation;
  let settled = false;

  const stopRecording = async () => {
    detachActiveSubs();
    try {
      await haltMicrophone();
    } catch {}
  };

  const finishWithSpeech = async (text: string, withRate: boolean) => {
    if (!alive() || settled) return;
    if (audioState !== 'LISTENING') return;
    if (!enterState('PROCESSING')) return;
    settled = true;
    try {
      await stopRecording();
    } catch {}
    if (!alive()) return;
    speakThenIdle(session, text, withRate);
  };

  const fail = async () => {
    await finishWithSpeech(RETRY_PHRASE, false);
    if (settled) {
      try { onError?.(RETRY_PHRASE); } catch {}
    }
  };

  const succeed = async (values: string[]) => {
    if (!alive() || settled || audioState !== 'LISTENING') return;
    const text = String(values[0] || '').trim();
    if (!text) {
      await fail();
      return;
    }
    if (!enterState('PROCESSING')) return;
    settled = true;
    try {
      console.log('[VoiceLog] ✅ Recognized text:', values);
    } catch {}
    try {
      await stopRecording();
    } catch {}
    if (!alive()) return;
    let spoken = '';
    try {
      const result = await onFinal(text);
      spoken = typeof result === 'string' ? result.trim() : '';
    } catch (e) {
      console.warn('[Voice] command', e);
    }
    if (!alive()) return;
    speakThenIdle(session, spoken || RETRY_PHRASE, Boolean(spoken));
  };

  try {
    // ★ 상세 진단 로그 및 volumechange 리스너 등록 ★
    activeSubs.push(
      ExpoSpeechRecognitionModule.addListener('start', () => {
        console.log('[VoiceLog] 🟢 [START] 인식 세션 시작');
      }),
      ExpoSpeechRecognitionModule.addListener('audiostart', () => {
        console.log('[VoiceLog] 🎙️ [AUDIO_START] 마이크 캡처 시작');
      }),
      ExpoSpeechRecognitionModule.addListener('speechstart', () => {
        console.log('[VoiceLog] 🗣️ [SPEECH_START] 사용자 음성 감지됨');
      }),
      ExpoSpeechRecognitionModule.addListener('volumechange', (event: { value: number }) => {
        console.log(`[VoiceLog] 🔊 [VOLUME] 입력 음량: ${event?.value?.toFixed(2)}`);
      }),
      ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        try {
          if (!alive() || settled) return;
          const values = (Array.isArray(event?.results) ? event.results : [])
            .map((row: any) => String(row?.transcript || '').trim())
            .filter(Boolean);
          if (event?.isFinal === false) return;
          if (values.length === 0) return;
          void succeed(values);
        } catch (e) {
          console.warn('[Voice] result', e);
        }
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
        try {
          console.error('[VoiceLog] ❌ [ERROR]', event?.error, event?.message);
          if (!alive() || settled || audioState !== 'LISTENING') return;
          if (String(event?.error || '') === 'aborted') return;
          void fail();
        } catch (e) {
          console.warn('[Voice] error', e);
        }
      }),
      ExpoSpeechRecognitionModule.addListener('nomatch', () => {
        try {
          console.log('[VoiceLog] ⚠️ [NOMATCH] 인식 결과 없음');
          if (!alive() || settled || audioState !== 'LISTENING') return;
          void fail();
        } catch {}
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        try {
          console.log('[VoiceLog] 🏁 [END] 인식 세션 종료');
          if (!alive() || settled || audioState !== 'LISTENING') return;
          void fail();
        } catch {}
      }),
    );
  } catch (e) {
    console.warn('[Voice] listener', e);
    detachActiveSubs();
    onError?.('음성 인식을 시작하지 못했습니다.');
    return () => {};
  }

  const stop = () => {
    if (!alive() || settled) return;
    if (audioState !== 'LISTENING') return;
    settled = true;
    generation += 1;
    void stopRecording().finally(() => {
      if (audioState === 'LISTENING' || audioState === 'PROCESSING') forceIdle();
      setTimeout(() => {
        try { resumeHeadsetSession(); } catch {}
      }, SPEAK_DELAY_MS);
    });
  };

  if (!enterState('LISTENING')) {
    detachActiveSubs();
    onError?.('음성 인식을 시작하지 못했습니다.');
    return () => {};
  }

  try {
    const listenMs = options?.listenMs ?? LISTEN_TIMEOUT_MS;
    console.log('[Voice] Voice.start ko-KR (listenMs:', listenMs, ')');
    const started = ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: false,
      continuous: false,
      addsPunctuation: false,
      maxAlternatives: 3,
      volumeChangeEventOptions: { enabled: true }, // ★ 음량 이벤트 활성화
      iosCategory: IOS_VOICE_CATEGORY,
      contextualStrings: [
        'A팀', 'B팀', '에이팀', '비팀',
        '득점', '범실', '디그', '블록', '서브에이스', '리시브', '토스', '어시스트',
        '앞차', '백차', '세터', '레프트', '라이트', '센터',
        '레프트백', '레백', '센터백', '센백', '라이트백', '라백',
        '선수교체', '코트 반전', '세트 마감', '경기 종료', '취소',
      ],
    });
    if (started && typeof (started as Promise<void>).then === 'function') await started;
    if (!alive()) return () => {};
    if (listenMs > 0) {
      setTimeout(() => {
        if (!alive() || settled || audioState !== 'LISTENING') return;
        void fail();
      }, listenMs);
    }
  } catch (e) {
    console.warn('[Voice] start', e);
    void fail();
    return () => {};
  }

  return stop;
}