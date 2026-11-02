import { z } from "zod";

import type { OrderSaleUnit } from "./order.js";

/**
 * **Les fiches de réassort au poste de colisage** (réassort, lot R3b,
 * 2026-10-21 — `documentation/reassort-boutiques/README.md`).
 * Une fiche par réassort d'un point servi par transfert, à part des
 * commandes : le poste saisit la quantité réellement emballée, puis clôt.
 * Aucun montant : un réassort est un mouvement interne.
 */

/** Une ligne : demandé, et emballé une fois saisi. */
export interface PackingResupplyLineView {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
  readonly requested: number;
  /** `null` : pas encore saisie. Même unité que `requested`. */
  readonly packed: number | null;
  /**
   * L'unité de la ligne (lot L2b-3 de `limites-de-commande/jour-meme-sur-stock.md`) :
   * un réassort au poids s'emballe en un lot, saisi en grammes.
   */
  readonly saleUnit: OrderSaleUnit;
  /**
   * Les pièces réservées que le four n'a pas encore remises (fiche « au plus
   * tôt », R4b) ; 0 : tout est là, ou fiche du soir (rien de réservé).
   */
  readonly awaitingOven: number;
}

/** `evening` : figé à l'arrêt du soir ; `asap` : « au plus tôt », lancé dans la journée (R4b). */
export type PackingResupplyKind = "evening" | "asap";

/** Une fiche de réassort du jour. */
export interface PackingResupplyView {
  readonly resupplyId: string;
  /** « Réassort <point> », suffixé « · au plus tôt » pour un lancé. */
  readonly title: string;
  /** Les « au plus tôt » viennent en tête de la liste. */
  readonly kind: PackingResupplyKind;
  readonly siteId: string;
  /** La destination : le transfert interne vers ce point. */
  readonly destination: { readonly kind: "transfer"; readonly siteId: string };
  readonly status: "open" | "closed";
  /** Une fiche ouverte dont une ligne attend encore le four (R4b). */
  readonly awaitingOven: boolean;
  readonly closedAt: string | null;
  readonly lines: readonly PackingResupplyLineView[];
}

/** Les fiches de réassort d'une journée au colisage. */
export interface PackingResuppliesView {
  readonly date: string;
  readonly resupplies: readonly PackingResupplyView[];
}

/** La saisie d'une ligne : la forme seulement — la borne (≤ demandé) est au domaine. */
export const enterPackedResupplyLineSchema = z.object({
  quantity: z.number().int().min(0),
});
export type EnterPackedResupplyLine = z.infer<typeof enterPackedResupplyLineSchema>;
