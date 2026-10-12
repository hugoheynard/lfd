import { BillingRhythmChangePendingError } from "../errors/billing-rhythm-errors.js";
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
 * programmé. Le report n'a lieu qu'au réglage suivant ({@link change}), et
 * seulement une fois la clôture de prise d'effet facturée (§12) : c'est ce qui
 * garantit qu'aucune clôture n'est relue sous un rythme qui l'a précédée de
 * deux bascules, sans historique des rythmes.
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
   * Règle `rhythm` à l'instant `at` — **un seul changement à la fois** (plan,
   * §12).
   *
   * Un programmé est **en attente** tant que la clôture où il prend effet n'a
   * pas été tentée par la facture (`scheduledInvoiced`, lu par l'appelant : le
   * réglage ne lit pas la base). Pendant l'attente :
   * - redemander le programmé → rien : une saisie rejouée n'est pas un fait ;
   * - revenir au rythme en vigueur avant la prise d'effet → le programmé est
   *   ANNULÉ ;
   * - tout autre rythme → refusé.
   *
   * Sans attente (rien de programmé, ou sa clôture déjà facturée), le
   * programmé est reporté sur le courant, puis :
   * - égal au rythme qui fait foi → rien (`null`) ;
   * - sinon → programmé à la prochaine clôture du rythme qui fait foi, jamais
   *   avant la prise d'effet du précédent.
   *
   * @returns le nouveau réglage et ce qui a changé, ou `null` si rien ne change.
   * @throws {BillingRhythmChangePendingError} un autre changement est en attente.
   */
  change(
    rhythm: BillingRhythm,
    at: Date,
    scheduledInvoiced: boolean,
  ): { readonly setting: BillingRhythmSetting; readonly change: BillingRhythmChange } | null {
    const pending = scheduledInvoiced ? null : this.scheduled;
    if (pending !== null) {
      return this.changeWhilePending(pending, rhythm, at);
    }
    const from = this.scheduled?.rhythm ?? this.current;
    if (rhythm.equals(from)) {
      return null;
    }
    const since =
      this.scheduled !== null && at < this.scheduled.effectiveAt ? this.scheduled.effectiveAt : at;
    const effectiveAt = nextClosureAfter(since, from);
    return {
      setting: new BillingRhythmSetting(from, { rhythm, effectiveAt }),
      change: { from, to: rhythm, effectiveAt },
    };
  }

  /** Le réglage pendant qu'un changement attend sa première facture. */
  private changeWhilePending(
    pending: ScheduledBillingRhythm,
    rhythm: BillingRhythm,
    at: Date,
  ): { readonly setting: BillingRhythmSetting; readonly change: BillingRhythmChange } | null {
    if (rhythm.equals(pending.rhythm)) {
      return null;
    }
    if (rhythm.equals(this.current) && at < pending.effectiveAt) {
      return {
        setting: new BillingRhythmSetting(this.current, null),
        change: { from: this.current, to: this.current, effectiveAt: null },
      };
    }
    throw new BillingRhythmChangePendingError(pending.effectiveAt);
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
