import { BillingRhythm } from "./billing-rhythm.js";

/** Un rythme programmé, et l'instant (une clôture de l'ancien) où il prend effet. */
export interface ScheduledBillingRhythm {
  readonly rhythm: BillingRhythm;
  readonly effectiveAt: Date;
}

/**
 * **Un rythme en vigueur, et peut-être un suivant programmé** — une VUE.
 *
 * Depuis M1 (plan `plan-rythme-de-facturation.md`, §16.6-1), la source des
 * dates d'un mode est son historique append-only (`ModeDatesTimeline`) ; ce
 * réglage n'en est qu'une lecture à deux segments, commode pour dire « en
 * vigueur / programmé » et pour poser une suite de clôtures dans un test. Il
 * ne se change plus : la règle « un seul changement à la fois » vit dans
 * l'historique (`BillingModeDatesHistory`).
 *
 * Immuable.
 */
export class BillingRhythmSetting {
  private constructor(
    readonly current: BillingRhythm,
    readonly scheduled: ScheduledBillingRhythm | null,
  ) {}

  /** Mensuel le 1er, rien de programmé : une entité qui n'a rien réglé. */
  static initial(): BillingRhythmSetting {
    return new BillingRhythmSetting(BillingRhythm.default(), null);
  }

  static of(
    current: BillingRhythm,
    scheduled: ScheduledBillingRhythm | null,
  ): BillingRhythmSetting {
    return new BillingRhythmSetting(current, scheduled);
  }

  /** Le rythme qui fait foi à `instant` : le programmé dès sa prise d'effet. */
  rhythmAt(instant: Date): BillingRhythm {
    const scheduled = this.scheduled;
    return scheduled === null || instant < scheduled.effectiveAt ? this.current : scheduled.rhythm;
  }

  /** Même rythme en vigueur, même programmé à la même prise d'effet. */
  equals(other: BillingRhythmSetting): boolean {
    if (!this.current.equals(other.current)) {
      return false;
    }
    if (this.scheduled === null || other.scheduled === null) {
      return this.scheduled === other.scheduled;
    }
    return (
      this.scheduled.rhythm.equals(other.scheduled.rhythm) &&
      this.scheduled.effectiveAt.getTime() === other.scheduled.effectiveAt.getTime()
    );
  }
}
