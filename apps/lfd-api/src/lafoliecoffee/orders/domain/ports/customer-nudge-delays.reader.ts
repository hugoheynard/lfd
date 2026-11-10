/**
 * Les délais des deux relances, en minutes après la fin du créneau — tolérance
 * de retard COMPRISE (Hugo, 2026-11-03) : une relance compte depuis l'instant
 * où la commande devient en retard, pas depuis la fin du créneau. Sans quoi
 * « Avertir le client » se proposait avant que la Supervision ne dise le
 * retard.
 */
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
