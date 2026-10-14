import { z } from "zod";

/**
 * **L'interrupteur de l'heure limite générale** (Hugo, 2026-10-14 —
 * `documentation/commandes/plan-reglages-commandes.md`, §8 et §8.1, lot O3).
 *
 * Désactivée, la règle du commerce (`OrderCutoff`) n'est plus servie : ni à la
 * passation, ni à la boutique (`GET /fulfillment-days`), ni au fournil (l'heure
 * d'arrêt n'est plus bornée). Elle reste en base : la réactiver la remet telle
 * quelle. Les limites PRODUIT, leur rattrapage, leurs dérogations et leur
 * surtaxe ne changent pas ; l'arrêt du plan ferme une journée dans tous les cas.
 */
export interface OrderCutoffSettingsView {
  /** `true` : la règle générale s'applique. */
  readonly enabled: boolean;
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

/** Le réglage tant que personne ne l'a posé : activée — rien ne s'ouvre au déploiement. */
export const DEFAULT_ORDER_CUTOFF_SETTINGS: OrderCutoffSettingsView = {
  enabled: true,
  sameDayAllowed: false,
  updatedAt: null,
  updatedBy: null,
};

/** `PATCH /admin/order-cutoff-settings` — les seules clés présentes changent, il en faut une. */
export const orderCutoffSettingsPatchSchema = z
  .object({ enabled: z.boolean().optional(), sameDayAllowed: z.boolean().optional() })
  .refine((patch) => patch.enabled !== undefined || patch.sameDayAllowed !== undefined, {
    message: "au moins un réglage : enabled ou sameDayAllowed",
  });
export type OrderCutoffSettingsPatch = z.infer<typeof orderCutoffSettingsPatchSchema>;
