import { InconsistentPromotionSelectionError } from "../errors/mercuriale-promotion-policy-errors.js";

/*
 * **La politique de promotions d'une mercuriale** — ce que la résolution en lit
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 7 et § 8).
 *
 * Sur les articles que la mercuriale FIXE, son client reçoit aucune promotion,
 * toutes, ou celles qu'elle nomme. C'est la mercuriale qui le décide, et non
 * la promotion : le commercial qui négocie sait ce qu'il a promis (« prix
 * net » ou « prix négociés + promotions du moment »), celui qui pose une
 * promotion pense à une opération (Hugo, 2026-10-31).
 *
 * Une décision DATÉE, portée par le mécanisme qui date déjà la mercuriale
 * (Hugo, 2026-10-31) : le document porte sa politique de départ, un avenant
 * peut en porter une nouvelle à partir de sa date d'effet. Rien ne se modifie
 * sur place — une lecture datée lit la politique de sa date (R17).
 */

/** Les trois positions du choix (§ 7). */
export const MERCURIALE_PROMOTION_MODES = ["none", "all", "selected"] as const;
export type MercurialePromotionMode = (typeof MERCURIALE_PROMOTION_MODES)[number];

/**
 * **Ce qu'une mercuriale laisse passer** — sa politique, et la forme que porte
 * la règle de son étage, puis la ligne tarifée et la ligne du panier.
 * `promotionIds` n'est rempli qu'en `selected`, trié, sans doublon.
 */
export interface PromotionAdmission {
  readonly mode: MercurialePromotionMode;
  readonly promotionIds: readonly string[];
}

/** « Aucune promotion » — le défaut d'une mercuriale neuve (§ 7, § 8). */
export const NO_PROMOTION_ADMITTED: PromotionAdmission = { mode: "none", promotionIds: [] };

/**
 * La politique en forme canonique : liste triée sans doublon ; refusée si
 * elle ne va pas avec le mode.
 *
 * @throws {InconsistentPromotionSelectionError} liste vide en « Au choix », ou liste hors « Au choix ».
 */
export function checkedAdmission(admission: PromotionAdmission): PromotionAdmission {
  const ids = [...new Set(admission.promotionIds)].sort();
  if (admission.mode === "selected" && ids.length === 0) {
    throw new InconsistentPromotionSelectionError("empty");
  }
  if (admission.mode !== "selected" && ids.length > 0) {
    throw new InconsistentPromotionSelectionError("unexpected");
  }
  return { mode: admission.mode, promotionIds: ids };
}

/** Ce que la politique du document et de ses avenants demande pour être lue à une date. */
export interface PolicedGrid {
  readonly promotionPolicy: PromotionAdmission;
  readonly amendments: readonly {
    readonly validFrom: Date;
    readonly archivedAt: Date | null;
    readonly promotionPolicy?: PromotionAdmission | null | undefined;
  }[];
}

/**
 * **La politique en vigueur à cette date** : celle du dernier avenant qui en
 * porte une et dont la date d'effet est passée — à date égale, le dernier
 * écrit —, sinon celle du document.
 *
 * Un avenant rangé APRÈS `at` compte encore (la lecture datée les charge
 * ainsi) ; un avenant rangé avant ne compte plus.
 */
export function admissionAt(grid: PolicedGrid, at: Date): PromotionAdmission {
  let found: PromotionAdmission = grid.promotionPolicy;
  let since = Number.NEGATIVE_INFINITY;
  for (const amendment of grid.amendments) {
    const policy = amendment.promotionPolicy ?? null;
    const from = amendment.validFrom.getTime();
    const live = amendment.archivedAt === null || amendment.archivedAt.getTime() > at.getTime();
    if (policy !== null && live && from <= at.getTime() && from >= since) {
      found = policy;
      since = from;
    }
  }
  return found;
}

/** Cette promotion passe-t-elle le scellement de cette mercuriale ? */
export function admitsPromotion(admission: PromotionAdmission, promotionId: string): boolean {
  switch (admission.mode) {
    case "none":
      return false;
    case "all":
      return true;
    case "selected":
      return admission.promotionIds.includes(promotionId);
  }
}
