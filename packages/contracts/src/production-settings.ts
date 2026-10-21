import { z } from "zod";

/**
 * **Les réglages du fournil** — l'arrêt du plan, en lecture, et les jours
 * fermés (plan `documentation/production/arret-du-plan.md`). Les heures sont
 * des heures de pendule d'Europe/Paris, `HH:MM`.
 */

/**
 * **L'arrêt automatique**, tel que l'heure limite générale le fixe : `daysBefore`
 * jours avant la journée servie, à `time`, rattrapage compris. `1` = la veille.
 * Une limite à 22:00 la veille avec trois heures de rattrapage se dit « le
 * jour même (`0`) à 01:00 ».
 */
export interface ProductionAutomaticCloseView {
  readonly daysBefore: number;
  readonly time: string;
}

/**
 * `GET /admin/production/settings`.
 *
 * Depuis le 2026-10-21, le fournil ne règle plus ni mode ni heure : le plan
 * d'une journée s'arrête tout seul à la fin du rattrapage de l'heure limite
 * générale (`documentation/limites-de-commande/plan-une-seule-heure.md` §5).
 * La page le montre en lecture ; il se règle dans Réglages › Commandes ›
 * Heure limite.
 */
export interface ProductionSettingsView {
  /** `null` : aucune heure limite générale n'est posée — rien n'arrête le plan tout seul. */
  readonly automaticClose: ProductionAutomaticCloseView | null;
  /** Les jours fermés d'aujourd'hui (compris) à plus tard, `AAAA-MM-JJ`, dans l'ordre. */
  readonly closedDays: readonly string[];
}

/** `POST /admin/production/settings/closed-days` — la forme ; la date est jugée par le domaine. */
export const productionClosedDayPayloadSchema = z.object({
  date: z.string().trim().min(1),
});
export type ProductionClosedDayPayload = z.infer<typeof productionClosedDayPayloadSchema>;
