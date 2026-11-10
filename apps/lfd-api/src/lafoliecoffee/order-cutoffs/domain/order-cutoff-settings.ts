import {
  type SameDayProWithoutCredit,
  SHELF_HOLD_MINUTES_MAX,
  SHELF_HOLD_MINUTES_MIN,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  InvalidLateToleranceError,
  InvalidNudgeDelayError,
  InvalidResupplyCutoffTimeError,
  InvalidShelfHoldMinutesError,
} from "./order-cutoff-errors.js";

/** `HH:MM` sur 24 h : l'heure qui existe sur une pendule. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * **Le jour même**, tel qu'on l'écrit (plan
 * `documentation/commandes/passation/plan-reglages-commandes.md`, §8.3 ; sa page depuis
 * le 2026-10-21).
 *
 * Porte aussi, depuis le 2026-10-25, les **délais des deux relances d'un
 * retrait en retard** (« Rappel au client », « Avertir le client »), en
 * minutes après la fin du créneau.
 *
 * Porte aussi, depuis le lot R3a du réassort (2026-10-21), **l'heure limite
 * du réassort pour demain** (« la veille, HH:MM ») ; l'interrupteur
 * `resupply_subject_to_cutoff` qu'elle remplace est retiré de la base le
 * 2026-11-02 (ordre de Hugo).
 *
 * Porte aussi, depuis le lot L3 du circuit du jour J (2026-11-02), les
 * réglages de ce circuit — sans effet avant le lot L4.
 *
 * Il portait aussi l'interrupteur de l'heure limite générale (lot O3) : retiré
 * le 2026-10-21, l'heure limite déclenche l'arrêt du plan et reste donc
 * toujours en vigueur (`limites-de-commande/plan-une-seule-heure.md` §5). La
 * colonne `enabled` reste en base, ni lue ni écrite.
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1) — autoriser ce qui l'est déjà n'est pas une faute, et le handler
 * n'écrit alors rien. Copié sur `OrderOpening` : ce que cette classe garantit
 * est la TRACE, un geste porte son instant et son auteur.
 */
export class OrderCutoffSettings implements OrderCutoffSettingsState {
  readonly sameDayAllowed: boolean;
  readonly resupplyCutoffTime: string;
  readonly pickupReminderDelayMinutes: number;
  readonly delayWarningDelayMinutes: number;
  readonly lateToleranceMinutes: number;
  readonly sameDayPublicAllowed: boolean;
  readonly sameDayProAllowed: boolean;
  readonly sameDayProOnline: boolean;
  readonly sameDayProWithoutCredit: SameDayProWithoutCredit;
  readonly shelfHoldMinutes: number;

  private constructor(
    state: OrderCutoffSettingsState,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {
    this.sameDayAllowed = state.sameDayAllowed;
    this.resupplyCutoffTime = state.resupplyCutoffTime;
    this.pickupReminderDelayMinutes = state.pickupReminderDelayMinutes;
    this.delayWarningDelayMinutes = state.delayWarningDelayMinutes;
    this.lateToleranceMinutes = state.lateToleranceMinutes;
    this.sameDayPublicAllowed = state.sameDayPublicAllowed;
    this.sameDayProAllowed = state.sameDayProAllowed;
    this.sameDayProOnline = state.sameDayProOnline;
    this.sameDayProWithoutCredit = state.sameDayProWithoutCredit;
    this.shelfHoldMinutes = state.shelfHoldMinutes;
  }

  /**
   * Le réglage posé, avec son instant et son auteur. Une clé absente du geste
   * garde sa valeur courante : chaque page n'envoie que la sienne (le jour
   * même, l'heure du réassort — 2026-10-21).
   *
   * @throws {InvalidResupplyCutoffTimeError} l'heure du réassort n'existe pas.
   * @throws {InvalidNudgeDelayError} un délai de relance n'est pas un entier ≥ 0.
   * @throws {InvalidLateToleranceError} la tolérance de retard n'est pas un entier ≥ 0.
   * @throws {InvalidShelfHoldMinutesError} la tenue du stock sort de ses bornes.
   */
  static pose(input: {
    readonly current: OrderCutoffSettingsState;
    readonly patch: OrderCutoffSettingsChange;
    readonly at: Date;
    readonly author: StaffTrace;
  }): OrderCutoffSettings {
    const { current, patch } = input;
    const resupplyCutoffTime = patch.resupplyCutoffTime ?? current.resupplyCutoffTime;
    if (!CLOCK_TIME.test(resupplyCutoffTime)) {
      throw new InvalidResupplyCutoffTimeError(resupplyCutoffTime);
    }
    const state: OrderCutoffSettingsState = {
      sameDayAllowed: patch.sameDayAllowed ?? current.sameDayAllowed,
      resupplyCutoffTime,
      pickupReminderDelayMinutes: nudgeDelay(
        patch.pickupReminderDelayMinutes ?? current.pickupReminderDelayMinutes,
      ),
      delayWarningDelayMinutes: nudgeDelay(
        patch.delayWarningDelayMinutes ?? current.delayWarningDelayMinutes,
      ),
      lateToleranceMinutes: lateTolerance(
        patch.lateToleranceMinutes ?? current.lateToleranceMinutes,
      ),
      sameDayPublicAllowed: patch.sameDayPublicAllowed ?? current.sameDayPublicAllowed,
      sameDayProAllowed: patch.sameDayProAllowed ?? current.sameDayProAllowed,
      sameDayProOnline: patch.sameDayProOnline ?? current.sameDayProOnline,
      sameDayProWithoutCredit: patch.sameDayProWithoutCredit ?? current.sameDayProWithoutCredit,
      shelfHoldMinutes: shelfHold(patch.shelfHoldMinutes ?? current.shelfHoldMinutes),
    };
    return new OrderCutoffSettings(state, input.at, input.author);
  }

  /** Le geste ne change rien à l'état courant. */
  sameAs(current: OrderCutoffSettingsState): boolean {
    return STATE_KEYS.every((key) => this[key] === current[key]);
  }
}

/** Le réglage sans sa trace. */
export interface OrderCutoffSettingsState {
  readonly sameDayAllowed: boolean;
  /** L'heure limite du réassort pour demain, `HH:MM` la veille (lot R3a). */
  readonly resupplyCutoffTime: string;
  /** « Rappel au client » : minutes après la fin du créneau d'un retrait (2026-10-25). */
  readonly pickupReminderDelayMinutes: number;
  /** « Avertir le client » : minutes après la fin du créneau d'un retrait (2026-10-25). */
  readonly delayWarningDelayMinutes: number;
  /**
   * La tolérance de retard (Hugo, 2026-11-03) : minutes après la fin du
   * créneau avant qu'une commande soit « créneau dépassé ».
   */
  readonly lateToleranceMinutes: number;
  /**
   * Le circuit du jour J (lot L3, `limites-de-commande/jour-meme-sur-stock.md`
   * §3, 2026-11-02) : autoriser les particuliers, les pros, les pros en ligne ;
   * le sort d'un pro sans crédit au comptoir ; la tenue du stock par un
   * paiement en cours. Rien ne les lit avant le lot L4.
   */
  readonly sameDayPublicAllowed: boolean;
  readonly sameDayProAllowed: boolean;
  readonly sameDayProOnline: boolean;
  readonly sameDayProWithoutCredit: SameDayProWithoutCredit;
  readonly shelfHoldMinutes: number;
}

/** Le geste : chaque clé absente garde sa valeur courante. */
export type OrderCutoffSettingsChange = {
  readonly [K in keyof OrderCutoffSettingsState]?: OrderCutoffSettingsState[K] | undefined;
};

/** Les clés de l'état, pour la comparaison : une clé ajoutée ici est comparée. */
const STATE_KEYS = [
  "sameDayAllowed",
  "resupplyCutoffTime",
  "pickupReminderDelayMinutes",
  "delayWarningDelayMinutes",
  "lateToleranceMinutes",
  "sameDayPublicAllowed",
  "sameDayProAllowed",
  "sameDayProOnline",
  "sameDayProWithoutCredit",
  "shelfHoldMinutes",
] as const satisfies readonly (keyof OrderCutoffSettingsState)[];

/** La tenue du stock : un nombre entier de minutes, dans ses bornes (lot L3). */
function shelfHold(minutes: number): number {
  if (
    !Number.isInteger(minutes) ||
    minutes < SHELF_HOLD_MINUTES_MIN ||
    minutes > SHELF_HOLD_MINUTES_MAX
  ) {
    throw new InvalidShelfHoldMinutesError(minutes);
  }
  return minutes;
}

/** Un délai de relance : un nombre entier de minutes, jamais négatif. */
function nudgeDelay(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new InvalidNudgeDelayError(minutes);
  }
  return minutes;
}

/**
 * La tolérance de retard : un nombre entier de minutes, jamais négatif. Pas
 * de borne haute, comme les délais de relance voisins (2026-11-03).
 */
function lateTolerance(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new InvalidLateToleranceError(minutes);
  }
  return minutes;
}
