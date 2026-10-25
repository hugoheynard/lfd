import { z } from "zod";

/**
 * **Les deux relances d'un retrait en retard**, vues de la Supervision (Hugo,
 * 2026-10-25) — selon qui est en retard, jamais les deux à la fois :
 *
 * - **« Rappel au client »** : la commande est prête, la fin du créneau est
 *   passée, le client n'est pas venu ;
 * - **« Avertir le client »** : la fin du créneau est passée, la commande
 *   n'est pas prête.
 *
 * Chacune ne part qu'UNE fois par commande, et seulement passé son délai
 * après la fin du créneau (Réglages › Commandes › Heure limite). Le serveur
 * refuse le reste (409) ; cette vue dit à l'écran quand proposer le geste, et
 * qui l'a déjà fait.
 */
export interface CustomerNudgesView {
  /** La date de service lue, `AAAA-MM-JJ`. */
  readonly date: string;
  /** Minutes après la fin du créneau avant « Rappel au client ». */
  readonly pickupReminderDelayMinutes: number;
  /** Minutes après la fin du créneau avant « Avertir le client ». */
  readonly delayWarningDelayMinutes: number;
  /** Les commandes du jour qui ont reçu au moins une relance — les autres n'y sont pas. */
  readonly orders: readonly OrderCustomerNudgesView[];
}

/** Les relances d'UNE commande ; `null` = pas encore faite. */
export interface OrderCustomerNudgesView {
  readonly orderId: string;
  readonly pickupReminder: CustomerNudgeTraceView | null;
  readonly delayWarning: CustomerNudgeTraceView | null;
}

/** « Rappel envoyé le … par … ». */
export interface CustomerNudgeTraceView {
  /** ISO de l'envoi. */
  readonly at: string;
  /** Le nom de qui l'a fait, à l'annuaire ; `null` s'il n'y est plus. */
  readonly byName: string | null;
}

/** `GET /admin/supervision/customer-nudges?date=` — la date de service, obligatoire. */
export const customerNudgesQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type CustomerNudgesQuery = z.infer<typeof customerNudgesQuerySchema>;
