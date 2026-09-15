// Haptic or audible feedback when an answer is graded (ADR 0002, option 5):
// feel « su / raté » without looking. Vibration exists on Android Chrome only
// (iOS Safari has no API); the sound is a short WebAudio blip, unlocked by the
// tap that graded. Driven by Settings.answerFeedback; vibration by default on
// touch screens, nothing on a PC.

import { getSettings } from '../db'
import { isCoarsePointer } from './media'

export type AnswerFeedback = 'vibration' | 'son' | 'aucun'

export function defaultAnswerFeedback(): AnswerFeedback {
  return isCoarsePointer() ? 'vibration' : 'aucun'
}

export function vibrateSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

let audio: AudioContext | null = null

function blip(correct: boolean) {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const t = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(correct ? 880 : 220, t)
    if (correct) osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (correct ? 0.14 : 0.28))
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + 0.3)
  } catch {
    /* no audio */
  }
}

export function playAnswerFx(correct: boolean, mode: AnswerFeedback | undefined): void {
  const m = mode ?? defaultAnswerFeedback()
  if (m === 'vibration') {
    try {
      navigator.vibrate?.(correct ? 12 : [25, 40, 25])
    } catch {
      /* ignore */
    }
  } else if (m === 'son') blip(correct)
}

/** Fire-and-forget from the answer handler: reads the setting, then plays. */
export function answerFx(correct: boolean): void {
  getSettings()
    .then((s) => playAnswerFx(correct, s.answerFeedback))
    .catch(() => undefined)
}
