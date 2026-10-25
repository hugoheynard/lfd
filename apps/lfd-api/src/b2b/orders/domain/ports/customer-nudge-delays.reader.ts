/** Les délais des deux relances, en minutes après la fin du créneau. */
export interface CustomerNudgeDelays {
  readonly pickupReminderMinutes: number;
  readonly delayWarningMinutes: number;
}

/**
 * **Quand une relance d'un retrait en retard se propose** — le réglage de
 * Réglages › Commandes › Heure limite (Hugo, 2026-10-25). Port étroit (ISP) :
 * les relances ne lisent que ces deux délais du réglage.
 */
export abstract class CustomerNudgeDelaysReader {
  abstract delays(): Promise<CustomerNudgeDelays>;
}
