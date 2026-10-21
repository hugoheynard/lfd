import { z } from "zod";

/**
 * **Les fiches de réassort au poste de colisage** (réassort, lot R3b,
 * 2026-10-21 — `documentation/reassort-boutiques/plan-reapprovisionnement.md`
 * §13). Une fiche par réassort d'un point servi par transfert, à part des
 * commandes : le poste saisit la quantité réellement emballée, puis clôt.
 * Aucun montant : un réassort est un mouvement interne.
 */

/** Une ligne : demandé, et emballé une fois saisi. */
export interface PackingResupplyLineView {
  readonly sku: string;
  readonly productName: string;
  readonly requested: number;
  /** `null` : pas encore saisie. */
  readonly packed: number | null;
}

/** Une fiche de réassort du jour. */
export interface PackingResupplyView {
  readonly resupplyId: string;
  /** « Réassort <point> ». */
  readonly title: string;
  readonly siteId: string;
  /** La destination : le transfert interne vers ce point. */
  readonly destination: { readonly kind: "transfer"; readonly siteId: string };
  readonly status: "open" | "closed";
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
