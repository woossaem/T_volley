export function speakKorean(text: string): void {
  if (!text) return;
  try {
    const Speech = require('expo-speech');
    Speech.stop();
    Speech.speak(text, { language: 'ko-KR', rate: 1.02, pitch: 1.0 });
  } catch (e) {
    console.warn('[TTS] speak skip', e);
  }
}
