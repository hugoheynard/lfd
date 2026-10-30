import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus du public et des libellés d'une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 15.4, lot L8b). Lus par du personnel qui n'a pas le code sous les yeux :
 * chaque message nomme le cas et le geste de sortie.
 */

/** Aucun public coché. */
export class PromotionAudienceSetEmptyError extends DomainError {
  constructor() {
    super(
      "promotions.audience_empty",
      "La promotion ne vise personne : cochez au moins un public (« Tout le monde », une branche ou une société).",
    );
  }
}

/** La même société nommée deux fois sous la même forme. */
export class PromotionAudienceDuplicateCompanyError extends DomainError {
  constructor(readonly companyId: string) {
    super(
      "promotions.audience_duplicate_company",
      `La société ${companyId} est cochée deux fois dans le public : retirez l'une des deux lignes.`,
    );
  }
}

/** Un libellé Particuliers ou Pros posé alors que le public ne touche pas cette audience. */
export class PromotionAudienceLabelWithoutAudienceError extends DomainError {
  constructor(readonly audience: "individuals" | "pros") {
    const name = audience === "individuals" ? "Particuliers" : "Pros";
    super(
      "promotions.audience_label_without_audience",
      `Le libellé « ${name} » est rempli, mais le public de la promotion ne vise aucun ${name.toLowerCase()} : videz ce libellé, ou cochez un public ${name.toLowerCase()}.`,
    );
  }
}
