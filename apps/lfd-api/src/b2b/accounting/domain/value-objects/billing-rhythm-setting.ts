import { nextClosureAfter } from "../services/billing-cycle.js";
import { BillingRhythm } from "./billing-rhythm.js";

/** Un rythme programmé, et l'instant (une clôture de l'ancien) où il prend effet. */
export interface ScheduledBillingRhythm {
  readonly rhythm: BillingRhythm;
  readonly effectiveAt: Date;
}

/**
 * Ce qu'un réglage a réellement changé — de quoi écrire le fait au journal.
 *
 * `effectiveAt` nul : le changement ANNULE un rythme programmé, l'entité garde
 * celui qui est en vigueur (`to` est alors égal à `from`).
 */
export interface BillingRhythmChange {
  readonly from: BillingRhythm;
  readonly to: BillingRhythm;
  readonly effectiveAt: Date | null;
}

/**
 * **Le rythme de facturation réglé sur une entité** : celui en vigueur, et
 * peut-être un suivant, programmé (plan `plan-rythme-de-facturation.md`, §2.3).
 *
 * La règle qu'il porte : **un changement ne coupe jamais la période en cours.**
 * Il prend effet à la prochaine clôture de l'ANCIEN rythme ; la période en
 * cours se termine comme elle avait été annoncée. Sans quoi un bon pourrait
 * tomber dans deux périodes, ou dans aucune.
 *
 * ⚠️ **Le programmé n'est jamais reporté physiquement sur le courant par une
 * tâche** : passé `effectiveAt`, c'est la LECTURE ({@link rhythmAt}) qui rend le
 * programmé. Le report n'a lieu qu'au réglage suivant ({@link change}), parce
 * que c'est le seul moment où l'ancien rythme doit cesser d'être « courant »
 * pour calculer la prochaine prise d'effet.
 *
 * Immuable : chaque changement rend un nouveau réglage.
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
    return this.settledAt(instant).current;
  }

  /**
   * Règle `rhythm` à l'instant `at`.
   *
   * - égal au rythme en vigueur et rien de programmé → rien (`null`) ;
   * - égal au rythme en vigueur avec un programmé → le programmé est ANNULÉ ;
   * - égal au programmé → rien : une saisie rejouée n'est pas un fait ;
   * - sinon → programmé à la prochaine clôture du rythme en vigueur, en
   *   REMPLAÇANT un programmé pas encore entré en vigueur.
   *
   * @returns le nouveau réglage et ce qui a changé, ou `null` si rien ne change.
   */
  change(
    rhythm: BillingRhythm,
    at: Date,
  ): { readonly setting: BillingRhythmSetting; readonly change: BillingRhythmChange } | null {
    const settled = this.settledAt(at);
    const from = settled.current;
    if (rhythm.equals(from)) {
      return settled.scheduled === null
        ? null
        : {
            setting: new BillingRhythmSetting(from, null),
            change: { from, to: from, effectiveAt: null },
          };
    }
    if (settled.scheduled !== null && settled.scheduled.rhythm.equals(rhythm)) {
      return null;
    }
    const effectiveAt = nextClosureAfter(at, from);
    return {
      setting: new BillingRhythmSetting(from, { rhythm, effectiveAt }),
      change: { from, to: rhythm, effectiveAt },
    };
  }

  /** Le même réglage, le programmé reporté sur le courant s'il est entré en vigueur. */
  private settledAt(instant: Date): BillingRhythmSetting {
    const scheduled = this.scheduled;
    if (scheduled === null || instant < scheduled.effectiveAt) {
      return this;
    }
    return new BillingRhythmSetting(scheduled.rhythm, null);
  }
}
