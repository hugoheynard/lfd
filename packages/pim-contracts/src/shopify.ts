import { z } from "zod";

/**
 * Contrat de fil du canal **Shopify** côté produits : l'état de synchro
 * (bindings) et le push. Le push est réel en mode `live`, simulé en `dry-run`
 * (le backend choisit d'après les réglages de connexion).
 */
export const pushPayloadSchema = z.object({
  productIds: z.array(z.string()).optional(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

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
