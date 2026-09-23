// Spracheingabe: Web Speech API (Live-Transkript) mit Fallback auf Audioaufnahme für Gemini.
// Entscheidungslogik ist DOM-frei/testbar; die Wrapper nehmen ihre Browser-Konstruktoren injiziert.

export function pickInputMode({ hasSpeechRecognition, hasMediaRecorder, hasGeminiKey }) {
  if (hasSpeechRecognition) return 'speech';
  if (hasMediaRecorder && hasGeminiKey) return 'audio';
  return 'text';
}

export function getSpeechRecognitionCtor(win = globalThis) {
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

// onTranscript(liveText, finalText) wird bei jedem Zwischenergebnis aufgerufen.
export function createSpeechInput({ SpeechRecognitionCtor, lang = 'de-DE', onTranscript, onEnd, onError }) {
  const rec = new SpeechRecognitionCtor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText = (finalText ? `${finalText} ` : '') + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    onTranscript?.((finalText + (interim ? ` ${interim}` : '')).trim(), finalText);
  };
  rec.onerror = e => onError?.(e.error ?? 'unbekannter Fehler');
  rec.onend = () => onEnd?.(finalText);
  return { start: () => rec.start(), stop: () => rec.stop() };
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Nimmt Audio auf, bis stop() aufgerufen wird; result löst mit { base64, mimeType } auf.
export async function recordAudio({
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderCtor = globalThis.MediaRecorder,
  mimeType = 'audio/webm',
} = {}) {
  if (!mediaDevices?.getUserMedia) throw new Error('Kein Mikrofonzugriff verfügbar');
  const stream = await mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  const rec = new MediaRecorderCtor(stream, { mimeType });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const result = new Promise(resolve => {
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      resolve({ base64: await blobToBase64(blob), mimeType });
    };
  });
  rec.start();
  return { stop: () => rec.stop(), result };
}
