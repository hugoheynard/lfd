import { z } from "zod";

/**
 * **Réglages › Comptoir** — le suivi du stock au comptoir, point par point
 * (décidé par Hugo le 2026-11-19). Désactivé — le défaut, tant que le point
 * n'a pas été réglé —, Comptoir › Réassort ne montre ni la colonne « Stock »
 * ni la colonne « État », et le serveur refuse de poser OK · Faible ·
 * Rupture (409 `resupply.stock_tracking.disabled`). Les alertes déjà
 * ouvertes restent lisibles au fournil et en Supervision.
 */

/** Le réglage d'un point, tel que l'écran le lit. */
export interface CounterSiteSettingsView {
  readonly siteId: string;
  /** Nom du point. */
  readonly siteLabel: string;
  /** `false` tant que le point n'a jamais été réglé. */
  readonly stockTracking: boolean;
  /**
   * Le « Retrait immédiat » du comptoir passe-t-il sans vérifier le stock
   * reçu ? `false` tant que le point n'a jamais été réglé. Activé, la vente
   * reste comptée au stock du jour, qui peut devenir négatif ; une commande
   * en ligne reste bornée par le reste.
   */
  readonly immediateWithoutStock: boolean;
  /** Instant de la dernière modification (ISO 8601) ; `null` si jamais réglé. */
  readonly updatedAt: string | null;
  /** Nom figé de qui l'a modifié en dernier ; `null` si jamais réglé. */
  readonly updatedBy: string | null;
}

/** `GET /admin/counter-settings` — tous les points non archivés, par nom. */
export interface CounterSettingsView {
  readonly sites: readonly CounterSiteSettingsView[];
}

/** `PUT /admin/counter-settings/:siteId` — pose les deux réglages du point. */
export const counterSettingsSchema = z
  .object({ stockTracking: z.boolean(), immediateWithoutStock: z.boolean() })
  .strict();
export type CounterSettingsPayload = z.infer<typeof counterSettingsSchema>;
