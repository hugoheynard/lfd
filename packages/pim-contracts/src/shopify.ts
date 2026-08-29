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
/**
 * Le mode du canal, **tel qu'il voyage sur le fil**.
 *
 * ⚠️ Ce contrat disait `dry_run`, avec un souligné. C'est la valeur de la BASE
 * — l'enum Postgres `ShopifyChannelMode`, où un tiret est interdit. L'API et
 * l'écran, eux, échangent `dry-run` depuis toujours. Le contrat décrivait donc
 * le stockage en se présentant comme le fil, et personne ne s'en apercevait :
 * rien ne l'importait.
 *
 * La correspondance base ↔ fil est le travail du repository, pas du contrat.
 */
export type ChannelMode = "live" | "dry-run";

/** Une ligne d'historique de poussée — la matière du rollback. */
export interface SnapshotView {
  readonly version: number;
  readonly hash: string;
  readonly mode: ChannelMode;
  readonly outcome: "pushed" | "failed";
  readonly pushedAt: string;
}

// ── Réconciliation à trois voies (BASE / OURS / THEIRS) ─────────────────────

/**
 * Statut d'un handle vu du trois-voies. `unknown` ≠ absent : la boutique est
 * illisible (dry-run/offline), pas « à jour ». Voir
 * `documentation/lfc/publication-reconciliation-3way.md`.
 */
export type ReconciliationStatus =
  | "never_published"
  | "up_to_date"
  | "local_ahead"
  | "remote_drift"
  | "conflict"
  | "to_remove"
  | "unknown";

/** Un champ qui diffère entre deux états (paire de la réconciliation). */
export interface FieldDiffView {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

/**
 * Forme de comparaison d'un produit — le dénominateur commun aux trois états. La
 * déclinaison se compare sur **SKU + prix** : son titre est exclu (Shopify le contrôle
 * → « Default Title » en mono-déclinaison), sans quoi tout produit dériverait au push.
 */
export interface ComparableView {
  readonly handle: string;
  readonly title: string;
  readonly status: string;
  readonly variants: readonly {
    readonly sku: string;
    readonly price: string | null;
  }[];
}

/** Une ligne du tableau de réconciliation. */
export interface ReconciliationRowView {
  readonly handle: string;
  /** `null` pour un handle sans produit courant (`to_remove`). */
  readonly productId: string | null;
  readonly status: ReconciliationStatus;
  /** Nombre de champs qui partiraient (OURS vs BASE). */
  readonly diffCount: number;
  /** Vrai seulement pour `remote_drift`/`conflict` — pilote le pictogramme ⚠️. */
  readonly remoteDrift: boolean;
}

/** Le tableau + le mode qui l'a produit (dry-run ⇒ colonne boutique inconnue). */
export interface ReconciliationBoardView {
  readonly mode: "live" | "dry-run";
  readonly rows: readonly ReconciliationRowView[];
}

/** Détail d'un handle : les trois états + les diffs par paire. */
export interface ReconciliationDetailView {
  readonly handle: string;
  readonly status: ReconciliationStatus;
  readonly base: ComparableView | null;
  readonly ours: ComparableView | null;
  readonly theirs: ComparableView | null;
  /** Ce qui partirait au prochain push. */
  readonly oursVsBase: readonly FieldDiffView[];
  /** Ce que la boutique a changé depuis la dernière poussée. */
  readonly theirsVsBase: readonly FieldDiffView[];
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

/**
 * La passe de **collections de taxe** qui précède un push de produits.
 *
 * Une fiche se range dans la collection `tva-*` de son taux ; si la collection
 * n'existe pas, le rangement échoue. La publication la crée donc d'elle-même,
 * au lieu de demander un second geste : la collection est entièrement dérivée
 * du régime (handle et titre viennent du taux), il n'y a aucune décision
 * humaine à confirmer.
 */
export interface TaxCollectionsPass {
  /** Les handles créés pendant cette passe. Vide = la boutique était à jour. */
  readonly created: readonly string[];
  /**
   * Pourquoi la passe n'a pas abouti, le cas échéant. Elle **n'interrompt pas**
   * la publication : une collection absente dégrade le rangement d'une fiche,
   * elle n'invalide pas la fiche.
   */
  readonly error: string | null;
}

/** Synthèse d'un push : le mode effectif + le résultat par produit. */
export interface PushSummary {
  readonly mode: "live" | "dry-run";
  readonly results: readonly PushReport[];
  /** La passe de collections de taxe. `null` en pré-push : il n'écrit rien. */
  readonly taxCollections: TaxCollectionsPass | null;
}
