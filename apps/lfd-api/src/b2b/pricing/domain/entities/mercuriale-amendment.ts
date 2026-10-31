import type { PromotionAdmission } from "./mercuriale-promotion-policy.js";
import type { PricingGridLine } from "../pricing-grid.js";

/**
 * **L'avenant daté d'une mercuriale** (`plan-tarif-date-sur-une-reference.md`).
 *
 * Un bloc immuable, rattaché à SON document : il ouvre des lignes de prix sur
 * une fenêtre datée, et peut arrêter, à sa date d'effet, des lignes qui
 * couraient — de la grille ou d'un avenant antérieur (Hugo, 2026-10-29, Q1).
 * Changer un prix = arrêter l'ancienne ligne et en ouvrir une nouvelle dans le
 * même avenant.
 *
 * Rien n'est réécrit : ni la grille, ni l'avenant d'origine. La composition se
 * fait à la lecture, ce qui laisse une relecture datée rendre exactement ce
 * qui s'appliquait à l'époque.
 *
 * Trois fichiers : les FORMES (ici), la COMPOSITION à une date
 * (`mercuriale-segments.ts`) et les REFUS (`mercuriale-amendment-checks.ts`).
 */

/** D'où vient l'avenant, quand ce n'est pas une saisie libre (le report du L7c). */
export interface AmendmentOrigin {
  readonly kind: "detached";
  readonly fromSku: string;
  readonly fromMercurialeId: string;
}

/** Ce qu'un appelant apporte pour amender : l'intention, pas l'état. */
export interface MercurialeAmendmentDraft {
  /** Les lignes OUVERTES, avec les invariants de la grille. Peut être vide. */
  readonly lines: readonly PricingGridLine[];
  /** Les articles dont la ligne en cours s'ARRÊTE à `validFrom`. Peut être vide. */
  readonly endedSkus: readonly string[];
  /** Borne basse incluse — aussi la date d'effet des arrêts. */
  readonly validFrom: Date;
  /** Borne haute exclue des lignes ouvertes. `null` = jusqu'à la fin du document. */
  readonly validTo: Date | null;
  readonly reason: string;
  readonly origin: AmendmentOrigin | null;
  /**
   * **Une nouvelle politique de promotions**, à partir de `validFrom` et
   * jusqu'au prochain avenant qui en porte une (`plan-la-mercuriale-decide.md`,
   * § 8) — facultative : absente ou `null`, l'avenant ne la change pas. Elle
   * ne suit PAS `validTo`, qui ne borne que les lignes ouvertes.
   */
  readonly promotionPolicy?: PromotionAdmission | null | undefined;
}

export interface MercurialeAmendment extends MercurialeAmendmentDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  /** Seule la clôture du document range un avenant (il ne se clôt pas seul). */
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/** Ce qu'il faut du document pour composer : sa fenêtre, sa grille, ses avenants. */
export interface AmendedGrid {
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly lines: readonly PricingGridLine[];
  /** Dans l'ordre d'écriture — l'ordre décide de ce qu'un arrêt touche. */
  readonly amendments: readonly MercurialeAmendment[];
}

/** Une ligne de prix effective sur `[from, to)`. `amendment` = `null` pour la grille. */
export interface LineSegment {
  readonly line: PricingGridLine;
  readonly from: Date;
  readonly to: Date | null;
  readonly amendment: MercurialeAmendment | null;
}
