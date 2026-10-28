import { z } from "zod";

/**
 * **Où le contrôle qualité se rend** — Réglages › Commandes (décision de Hugo,
 * 2026-10-26, `documentation/fournil/plan-controle-qualite.md`, D10).
 *
 * - `GET admin/production/quality-settings` → {@link QualityControlSettingsView},
 *   sous `lfc_order_settings:read` ;
 * - `PUT admin/production/quality-settings` ← {@link QualityControlSettingsPayload},
 *   sous `lfc_order_settings:write`, `204`.
 *
 * La Supervision ne lit pas cette route : elle reçoit les deux interrupteurs
 * dans ses pastilles (`QualityBoardView.enabled`).
 */
export const qualityControlSettingsPayloadSchema = z.object({
  /** « Contrôle qualité au fournil » — les lignes de préparation. */
  lineChecks: z.boolean(),
  /** « Contrôle qualité au colisage » — les commandes colisées. */
  orderChecks: z.boolean(),
});
export type QualityControlSettingsPayload = z.infer<typeof qualityControlSettingsPayloadSchema>;

/**
 * Les réglages tels qu'ils valent ; `default` : personne ne les a encore posés
 * — fournil désactivé, colisage activé (les défauts vivent dans le domaine).
 */
export interface QualityControlSettingsView {
  readonly lineChecks: boolean;
  readonly orderChecks: boolean;
  readonly source: "default" | "explicit";
}
