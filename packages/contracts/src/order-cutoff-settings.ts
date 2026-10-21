import { z } from "zod";

/**
 * **Le jour même** — Réglages › Commandes › Jour même (Hugo, 2026-10-14 pour
 * le réglage, 2026-10-21 pour sa page).
 *
 * Cette vue portait aussi l'interrupteur de l'heure limite générale (lot O3,
 * 2026-10-14). Il est retiré le 2026-10-21 : l'heure limite déclenche l'arrêt
 * du plan, elle est donc toujours en vigueur
 * (`documentation/limites-de-commande/plan-une-seule-heure.md` §5). La colonne
 * `enabled` reste en base, plus personne ne la lit ni ne l'écrit.
 */
export interface OrderCutoffSettingsView {
  /**
   * Une commande peut-elle viser aujourd'hui ? `false` par défaut (§8.3, Hugo
   * 2026-10-14) : le délai minimum est ce réglage, jamais une règle en dur.
   */
  readonly sameDayAllowed: boolean;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/** Le réglage tant que personne ne l'a posé : jour même fermé — rien ne s'ouvre au déploiement. */
export const DEFAULT_ORDER_CUTOFF_SETTINGS: OrderCutoffSettingsView = {
  sameDayAllowed: false,
  updatedAt: null,
  updatedBy: null,
};

/**
 * `PATCH /admin/order-cutoff-settings` — le jour même, seul réglage qui reste.
 * Strict : une charge qui porte encore `enabled` (l'interrupteur retiré le
 * 2026-10-21) est refusée plutôt qu'avalée en silence.
 */
export const orderCutoffSettingsPatchSchema = z.object({ sameDayAllowed: z.boolean() }).strict();
export type OrderCutoffSettingsPatch = z.infer<typeof orderCutoffSettingsPatchSchema>;
