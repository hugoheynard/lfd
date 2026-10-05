import { z } from "zod";

/**
 * **La colonne Contenants du poste de colisage** (K2b, 2026-10-04,
 * `documentation/colisage/plan-les-bacs-au-colisage.md` §5–§5.1).
 *
 * Routes, sous `admin/packing/:date/orders/:orderId` (droit
 * `production_packing` — `write` sauf la proposition, `read`) :
 *
 * - `POST containers` ({@link OpenPackingContainer}) → {@link OpenedPackingContainer} ;
 * - `POST containers/:containerId/lines/:sku` ({@link MovePackingPieces}) → 204 — répartir ;
 * - `POST containers/:containerId/lines/:sku/withdrawal` ({@link MovePackingPieces}) → 204 — retirer ;
 * - `POST containers/:containerId/void` → 204 — annuler ;
 * - `GET proposal` → `DeliveryPackingProposalView` — proposer (livraison seulement) ;
 * - `POST proposal/apply` → 204 — appliquer « Proposer » d'un coup : les bacs
 *   proposés naissent chez la livraison et se remplissent bac par bac (suite de
 *   K2b, plan §7). 409 `packing.proposal.containers_exist` si la commande a
 *   déjà un contenant vivant, `packing.proposal.empty` si la grille des
 *   contenances ne couvre rien ;
 * - `GET shareable-halves` → `DeliveryBinFreeHalvesView` — les moitiés libres
 *   des arrêts voisins ; partager = `POST containers` avec `partnerBinId`.
 *
 * Le poste se relit ensuite par `GET admin/packing/:date/board` : chaque
 * `PackingSheet` porte `containerMode`, `containerList`, et chaque ligne
 * `allocated` / `unallocated`.
 */

/** Un sac à emporter : il naît et vit au colisage. */
const bagSchema = z.strictObject({ nature: z.literal("bag") });

/** Un bac de livraison neuf — entier, ou la moitié gauche d'un bac cloisonné. */
const binSchema = z.strictObject({
  nature: z.literal("bin"),
  binTypeId: z.string().trim().min(1, "type de bac requis"),
  half: z.boolean(),
  innerBags: z.number().int("un nombre entier de sacs"),
});

/** L'autre moitié d'un bac dont une moitié est déjà à une commande voisine. */
const sharedHalfSchema = z.strictObject({
  nature: z.literal("bin"),
  partnerBinId: z.string().trim().min(1, "moitié partenaire requise"),
  innerBags: z.number().int("un nombre entier de sacs"),
});

/** Créer un contenant pour une commande. Les bornes sont au domaine. */
export const openPackingContainerSchema = z.union([bagSchema, binSchema, sharedHalfSchema]);
export type OpenPackingContainer = z.infer<typeof openPackingContainerSchema>;

/** Ce que rend la création : l'identifiant du contenant. Le client relit le poste. */
export interface OpenedPackingContainer {
  readonly containerId: string;
}

/** Glisser ou retirer des pièces d'une ligne. La quantité est validée au domaine. */
export const movePackingPiecesSchema = z.strictObject({
  quantity: z.number().int("un nombre entier de pièces"),
});
export type MovePackingPieces = z.infer<typeof movePackingPiecesSchema>;

/** Une ligne d'un contenant : l'article et combien il en porte. */
export interface PackingContainerLineView {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * Un contenant VIVANT d'une commande. Un contenant annulé, ou dont le bac a été
 * annulé, n'est pas servi.
 */
export interface PackingContainerView {
  readonly id: string;
  readonly nature: "bin" | "bag";
  /** Le libellé à afficher : le code du bac, ou « Sac N ». */
  readonly label: string;
  /** L'identifiant du bac de livraison (celui du QR) ; `null` pour un sac. */
  readonly binId: string | null;
  /** Le code court du bac ; `null` pour un sac. */
  readonly binCode: string | null;
  /** `null` = bac entier, ou sac. */
  readonly binHalf: "left" | "right" | null;
  /** Les lignes à quantité non nulle, par SKU. */
  readonly lines: readonly PackingContainerLineView[];
  /** Les pièces portées — calculé au serveur. */
  readonly pieces: number;
}
