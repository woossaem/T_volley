import { Platform } from 'react-native';

export async function startListening(
  onFinal: (transcript: string) => void,
  onError?: (message: string) => void,
): Promise<() => void> {
  if (Platform.OS === 'web') {
    onError?.('웹에서는 이어폰 음성 기록을 지원하지 않습니다.');
    return () => {};
  }

  let ExpoSpeechRecognitionModule: any;
  try {
    ExpoSpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch (e) {
    onError?.('음성 인식 모듈을 불러오지 못했습니다.');
    return () => {};
  }

  try {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission?.granted) {
      onError?.('마이크 또는 음성 인식 권한이 없습니다.');
      return () => {};
    }
  } catch (e) {
    onError?.('음성 인식 권한을 확인하지 못했습니다.');
    return () => {};
  }

  const subs = [
    ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
      if (!event?.isFinal) return;
      const text = String(event?.results?.[0]?.transcript || '').trim();
      if (text) onFinal(text);
    }),
    ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
      onError?.(String(event?.message || event?.error || '음성 인식에 실패했습니다.'));
    }),
    ExpoSpeechRecognitionModule.addListener('nomatch', () => {
      onError?.('음성을 알아듣지 못했습니다.');
    }),
  ];

  try {
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: false,
      continuous: false,
      addsPunctuation: false,
      maxAlternatives: 3,
      contextualStrings: [
        'A팀', 'B팀', '에이팀', '비팀',
        '득점', '범실', '점수', '실수',
        '앞차', '백차', '세터', '레프트', '라이트', '센터', '리베로',
        '레프트백', '센터백', '라이트백',
      ],
    });
  } catch (e) {
    subs.forEach((s) => s.remove());
    onError?.('음성 인식을 시작하지 못했습니다.');
    return () => {};
  }

  return () => {
    try {
      ExpoSpeechRecognitionModule.abort?.();
    } catch {}
    subs.forEach((s) => {
      try { s.remove(); } catch {}
    });
  };
}
