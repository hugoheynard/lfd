import { z } from "zod";

/**
 * Contrat de fil du canal **Shopify** côté produits : l'état de synchro
 * (bindings) et le push. Le push est réel en mode `live`, simulé en `dry-run`
 * (le backend choisit d'après les réglages de connexion).
 */
export const pushPayloadSchema = z.object({
  productIds: z.array(z.string()).optional(),
  /**
   * Pré-push **sans effet de bord** : projette et rapporte ce qui partirait, sans
   * appeler la boutique ni écrire (binding/snapshot). L'« aperçu avant envoi »,
   * honnête même quand le canal est en `live`.
   */
  dryRun: z.boolean().optional(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

/** Rejeu d'un snapshot antérieur — re-pousse la version ciblée du handle. */
export const rollbackPayloadSchema = z.object({
  handle: z.string().min(1),
  version: z.number().int().positive(),
});
export type RollbackPayload = z.infer<typeof rollbackPayloadSchema>;

/** Le mode du canal figé dans un snapshot (une simulation n'est pas une poussée réelle). */
export type ChannelMode = "live" | "dry_run";

/** Une ligne d'historique de poussée — la matière du rollback. */
export interface SnapshotView {
  readonly version: number;
  readonly hash: string;
  readonly mode: ChannelMode;
  readonly outcome: "pushed" | "failed";
  readonly pushedAt: string;
}

export type SyncStatus = "never_pushed" | "up_to_date" | "drifted" | "failed";
export type PushOutcome = "pushed" | "unchanged" | "failed";

/** État de synchro d'un produit — alimente la colonne Shopify du tableau. */
export interface ProductBindingView {
  readonly productId: string;
  readonly syncStatus: SyncStatus;
  readonly lastPushedAt: string | null;
  readonly lastError: string | null;
}

/** Résultat de push d'un produit. */
export interface PushReport {
  readonly productId: string;
  readonly sku: string;
  readonly outcome: PushOutcome;
  readonly message: string;
}

/** Synthèse d'un push : le mode effectif + le résultat par produit. */
export interface PushSummary {
  readonly mode: "live" | "dry-run";
  readonly results: readonly PushReport[];
}
