'use client';
// Browser speech in and out, for the assistant chat.
//
// Deliberately NOT the same path as VoiceModal, which records audio and sends
// it to /ai/voice for transcription. That is the right trade for entry, where
// accuracy on amounts and merchant names matters more than latency. A chat
// question is different: it wants to appear as you speak, and a round trip per
// question is both slow and an avoidable upload of the user's voice.
//
// Everything here degrades to "unsupported" rather than throwing, since
// support is uneven — Web Speech recognition is Chrome/Edge/Safari only, and
// speechSynthesis voices load asynchronously (and sometimes not at all).

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const speechInSupported = () => Boolean(SR);
export const speechOutSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// One recogniser at a time — starting a second while one runs throws.
let active = null;

// `onResult` fires with (text, isFinal) so the caller can show interim words
// as they are spoken and commit on the final pass.
export function listen({ onResult, onEnd, onError, lang = 'en-IN' }) {
  if (!SR) { onError?.(new Error('Speech recognition is not supported in this browser')); return () => {}; }
  stopListening();

  const rec = new SR();
  rec.lang = lang;          // en-IN so Indian place and food names fare better
  rec.interimResults = true; // show words as they arrive, not after a pause
  rec.continuous = false;    // a question is one utterance; stop at the pause
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    let text = '';
    let isFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) isFinal = true;
    }
    onResult?.(text.trim(), isFinal);
  };
  rec.onerror = (e) => {
    // "aborted" and "no-speech" are ordinary outcomes (the user stopped, or
    // said nothing) — surfacing those as errors would be noise.
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    onError?.(new Error(
      e.error === 'not-allowed' ? 'Microphone access was blocked' : `Speech error: ${e.error}`));
  };
  rec.onend = () => { if (active === rec) active = null; onEnd?.(); };

  active = rec;
  try { rec.start(); } catch (err) { active = null; onError?.(err); }
  return stopListening;
}

export function stopListening() {
  if (!active) return;
  try { active.stop(); } catch { /* already stopped */ }
  active = null;
}

// Voice selection. The browser exposes whatever the OS has installed, so the
// best we can do is prefer a female English voice and fall back gracefully
// rather than assume one exists.
const FEMALE_HINTS = [
  'female', 'woman',
  // Common OS voice names that are female, across platforms.
  'samantha', 'karen', 'moira', 'tessa', 'fiona', 'veena', 'rishi',
  'google uk english female', 'google us english', 'zira', 'heera', 'susan',
];

export function pickVoice() {
  if (!speechOutSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet; caller retries on the event

  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  const named = (v) => `${v.name} ${v.voiceURI || ''}`.toLowerCase();

  // Indian English first when a female one exists — this is an Indian rupee
  // app, and en-IN reads Indian names and numbers more naturally.
  const inFemale = pool.find((v) => /en[-_]IN/i.test(v.lang) && FEMALE_HINTS.some((h) => named(v).includes(h)));
  if (inFemale) return inFemale;

  const female = pool.find((v) => FEMALE_HINTS.some((h) => named(v).includes(h)));
  if (female) return female;

  return pool.find((v) => /en[-_]IN/i.test(v.lang)) || pool[0] || null;
}

// Voices populate asynchronously in most browsers, so a caller that wants one
// at mount has to wait for the event rather than reading an empty list once.
export function onVoicesReady(cb) {
  if (!speechOutSupported()) return () => {};
  const fire = () => cb(pickVoice());
  if (window.speechSynthesis.getVoices().length) fire();
  window.speechSynthesis.addEventListener('voiceschanged', fire);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', fire);
}

// Strips the markdown the assistant writes, so it is not read aloud as
// literal asterisks and bullet characters.
export function speakableText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>]/g, '')
    .replace(/^\s*[-•]\s*/gm, ', ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/₹\s?/g, ' rupees ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text, voice) {
  if (!speechOutSupported()) return;
  const clean = speakableText(text);
  if (!clean) return;
  const synth = window.speechSynthesis;

  const u = new SpeechSynthesisUtterance(clean);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = 1.02;
  u.pitch = 1.05;

  // cancel() then speak() in the same tick is a long-standing browser race:
  // Chrome regularly swallows the new utterance and nothing is heard. Only
  // cancel when something is actually playing, and let the cancel settle
  // before queuing the replacement.
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  // cancel() can also leave the engine paused, which silently blocks every
  // later utterance — this is why muting once could stop per-message playback
  // working at all.
  if (synth.paused) synth.resume();

  const start = () => {
    if (synth.paused) synth.resume();
    synth.speak(u);
  };
  if (busy) setTimeout(start, 60); else start();
  return u;
}

export function stopSpeaking() {
  if (!speechOutSupported()) return;
  window.speechSynthesis.cancel();
  // Leaving the engine paused after a cancel makes every later speak() a
  // no-op, so playback is unpaused straight away.
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
}
