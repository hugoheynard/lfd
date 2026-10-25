import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { InvalidNudgeDelayError, InvalidResupplyCutoffTimeError } from "./order-cutoff-errors.js";

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
 * `resupply_subject_to_cutoff` qu'elle remplace reste en base, ni lu ni écrit.
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
export class OrderCutoffSettings {
  private constructor(
    readonly sameDayAllowed: boolean,
    readonly resupplyCutoffTime: string,
    readonly pickupReminderDelayMinutes: number,
    readonly delayWarningDelayMinutes: number,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * Le réglage posé, avec son instant et son auteur. Une clé absente du geste
   * garde sa valeur courante : chaque page n'envoie que la sienne (le jour
   * même, l'heure du réassort — 2026-10-21).
   *
   * @throws {InvalidResupplyCutoffTimeError} l'heure du réassort n'existe pas.
   * @throws {InvalidNudgeDelayError} un délai de relance n'est pas un entier ≥ 0.
   */
  static pose(input: {
    readonly current: OrderCutoffSettingsState;
    readonly sameDayAllowed?: boolean | undefined;
    readonly resupplyCutoffTime?: string | undefined;
    readonly pickupReminderDelayMinutes?: number | undefined;
    readonly delayWarningDelayMinutes?: number | undefined;
    readonly at: Date;
    readonly author: StaffTrace;
  }): OrderCutoffSettings {
    const resupplyCutoffTime = input.resupplyCutoffTime ?? input.current.resupplyCutoffTime;
    if (!CLOCK_TIME.test(resupplyCutoffTime)) {
      throw new InvalidResupplyCutoffTimeError(resupplyCutoffTime);
    }
    return new OrderCutoffSettings(
      input.sameDayAllowed ?? input.current.sameDayAllowed,
      resupplyCutoffTime,
      nudgeDelay(input.pickupReminderDelayMinutes ?? input.current.pickupReminderDelayMinutes),
      nudgeDelay(input.delayWarningDelayMinutes ?? input.current.delayWarningDelayMinutes),
      input.at,
      input.author,
    );
  }

  /** Le geste ne change rien à l'état courant. */
  sameAs(current: OrderCutoffSettingsState): boolean {
    return (
      this.sameDayAllowed === current.sameDayAllowed &&
      this.resupplyCutoffTime === current.resupplyCutoffTime &&
      this.pickupReminderDelayMinutes === current.pickupReminderDelayMinutes &&
      this.delayWarningDelayMinutes === current.delayWarningDelayMinutes
    );
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
}

/** Un délai de relance : un nombre entier de minutes, jamais négatif. */
function nudgeDelay(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new InvalidNudgeDelayError(minutes);
  }
  return minutes;
}
