import { LiveAnnouncer } from '@angular/cdk/a11y';
import { inject, Injectable } from '@angular/core';

/** Une impulsion courte : « c'est pris ». */
const ACCEPTED_PATTERN: readonly number[] = [30];
/** Deux impulsions longues : « refusé, regarde l'écran ». */
const REFUSED_PATTERN: readonly number[] = [80, 60, 80];

/** Un bip, en hertz et en millisecondes. */
interface Tone {
  readonly hz: number;
  readonly ms: number;
}

/** Un bip aigu et court : pris. */
const ACCEPTED_TONES: readonly Tone[] = [{ hz: 880, ms: 80 }];
/** Deux bips graves : refusé. */
const REFUSED_TONES: readonly Tone[] = [
  { hz: 220, ms: 160 },
  { hz: 220, ms: 160 },
];
/** Le silence entre deux bips. */
const TONE_GAP_MS = 80;
/** Assez fort pour un fournil, sans saturer un haut-parleur de tablette. */
const TONE_GAIN = 0.2;

/**
 * **Dire qu'un geste a abouti, sans qu'on ait à regarder** — pour les écrans
 * de poste (fournil, colisage) où l'on tape les mains occupées.
 *
 * - une **vibration** sur l'appareil qui en a une ;
 * - **sinon, un bip** (iPad et Safari ne vibrent pas) : aigu et court pour un
 *   geste pris, deux graves pour un refus. Le son est synthétisé, aucun
 *   fichier n'est chargé ;
 * - toujours, une **annonce** aux lecteurs d'écran : polie pour un geste pris,
 *   immédiate pour un refus (RGAA, messages de statut).
 *
 * Rien n'échoue sans vibreur ni son : l'annonce part quand même.
 */
@Injectable({ providedIn: 'root' })
export class GestureFeedback {
  private readonly announcer = inject(LiveAnnouncer);
  private audio: AudioContext | null = null;

  accepted(message: string): void {
    this.signal(ACCEPTED_PATTERN, ACCEPTED_TONES);
    void this.announcer.announce(message, 'polite');
  }

  refused(message: string): void {
    this.signal(REFUSED_PATTERN, REFUSED_TONES);
    void this.announcer.announce(message, 'assertive');
  }

  private signal(pattern: readonly number[], tones: readonly Tone[]): void {
    if (!vibrate(pattern)) {
      this.beep(tones);
    }
  }

  /** Un contexte audio, créé au premier geste (le navigateur l'exige d'un geste). */
  private beep(tones: readonly Tone[]): void {
    if (typeof AudioContext === 'undefined') {
      return;
    }
    try {
      this.audio ??= new AudioContext();
      const context = this.audio;
      let at = context.currentTime;
      for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = tone.hz;
        gain.gain.value = TONE_GAIN;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + tone.ms / 1000);
        at += (tone.ms + TONE_GAP_MS) / 1000;
      }
    } catch {
      // Son refusé par le navigateur : l'annonce suffit.
    }
  }
}

/** Fait vibrer ; `false` quand l'appareil ne sait pas, ou refuse. */
function vibrate(pattern: readonly number[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  return navigator.vibrate([...pattern]);
}
