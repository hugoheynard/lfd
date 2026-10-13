import type { ManifestLine } from "../services/transfer-manifest.js";

/**
 * **Les formes du transfert interne** — sorties de `internal-transfer.ts`
 * pour la taille du fichier (lot T2), et ré-exportées par lui.
 */

/**
 * Un **élément** d'un transfert (décision de Hugo du 2026-10-13) : une
 * commande en retrait au site, ou un réapprovisionnement de la boutique du site — ce
 * second genre est déclaré, pas bâti : aucun écrivain ne le produit.
 */
export type TransferItem =
  | { readonly kind: "order"; readonly orderId: string }
  | { readonly kind: "resupply"; readonly resupplyId: string };

/**
 * Un élément tel que le transfert le range : son identifiant, son ajout, et
 * son retrait (lot T2) — absent : il y est toujours. Un élément retiré reste
 * en base ; il ne compte plus dans le transfert.
 */
export type HeldTransferItem = TransferItem & {
  readonly id: string;
  readonly attachedAt: Date;
  readonly detachedAt?: Date;
};

/** Une ligne du manifeste figé : l'élément qui la porte, et son contenu. */
export interface FrozenManifestLine extends ManifestLine {
  readonly itemId: string;
}

/**
 * **La réception au site** (plan du transfert interne, §3, lot T2) : quand,
 * par qui (une fiche staff), et le motif — obligatoire pour une réception
 * manuelle (sans départ), `null` pour une remise après le départ.
 */
export interface TransferReceipt {
  readonly at: Date;
  readonly by: string;
  readonly reason: string | null;
}

/** Où en est un transfert : le diagramme du §3. */
export type TransferState = "planned" | "departed" | "received";

/** L'état persisté d'un transfert — ce que `restore` réhydrate et `toSnapshot` rend. */
export interface InternalTransferState {
  readonly id: string;
  readonly serviceDay: string;
  readonly siteId: string;
  /** Le nom du site, FIGÉ à l'ouverture. */
  readonly siteLabel: string;
  readonly items: readonly HeldTransferItem[];
  readonly departedAt: Date | null;
  /** Facultatif à la RÉHYDRATATION seulement — absent vaut `null` ; `toSnapshot` le rend toujours. */
  readonly received?: TransferReceipt | null;
  /** Le manifeste figé au départ ; vide tant qu'il n'est pas parti. */
  readonly manifest: readonly FrozenManifestLine[];
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Le contenu d'un élément, lu au moment du départ ; `undefined` : inconnu. */
export type ItemContents = (item: HeldTransferItem) => readonly ManifestLine[] | undefined;

/** L'identifiant opaque de ce que l'élément porte. */
export function subjectOf(item: TransferItem): string {
  return item.kind === "order" ? item.orderId : item.resupplyId;
}

/** Un élément toujours porté : ni retiré, ni d'un autre sujet. */
export function isLive(item: HeldTransferItem): boolean {
  return item.detachedAt === undefined;
}

/** Ce que `detachOrder` a fait d'une commande (lot T2, décision 4 de Hugo). */
export type TransferDetachment = "detached" | "frozen" | "absent";
