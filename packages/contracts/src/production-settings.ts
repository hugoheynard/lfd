import { z } from "zod";

/**
 * **Les réglages du fournil** — l'arrêt du plan, en lecture, et les jours
 * fermés (plan `documentation/fournil/arret-du-plan.md`). Les heures sont
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
  /** Les tranches de production (plan `fournil/plan-tranches-de-production.md`, T1). */
  readonly tranches: ProductionTranchesView;
}

/**
 * **Les tranches de production** (Hugo, 2026-10-28) : `fixed` — les heures
 * réglées ici, où chaque besoin tombe dans la dernière tranche au plus tard à
 * son heure ; `computed` — les heures des besoins eux-mêmes.
 */
export const PRODUCTION_TRANCHE_MODES = ["fixed", "computed"] as const;
export type ProductionTrancheMode = (typeof PRODUCTION_TRANCHE_MODES)[number];

/** Au plus huit heures fixes : au-delà, ce ne sont plus des repères d'atelier. */
export const MAX_FIXED_TRANCHES = 8;

/** Le réglage tel qu'il est servi. Sans réglage enregistré : `fixed`, aucune heure. */
export interface ProductionTranchesView {
  readonly mode: ProductionTrancheMode;
  /** `HH:mm`, triées, sans doublon ; vides en mode fixe = une seule tranche, la journée. */
  readonly fixedTranches: readonly string[];
}

/**
 * `PUT /admin/production/settings/tranches` — la forme. Le tri, l'unicité et la
 * borne sont jugés par le domaine, qui nomme le refus.
 */
export const productionTranchesPayloadSchema = z
  .object({
    mode: z.enum(PRODUCTION_TRANCHE_MODES),
    fixedTranches: z.array(
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:mm"),
    ),
  })
  .strict();
export type ProductionTranchesPayload = z.infer<typeof productionTranchesPayloadSchema>;

/** `POST /admin/production/settings/closed-days` — la forme ; la date est jugée par le domaine. */
export const productionClosedDayPayloadSchema = z.object({
  date: z.string().trim().min(1),
});
export type ProductionClosedDayPayload = z.infer<typeof productionClosedDayPayloadSchema>;
