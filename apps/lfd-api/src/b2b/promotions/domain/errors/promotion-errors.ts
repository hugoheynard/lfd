import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus d'une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.3). Chaque message est lu par du personnel qui n'a pas le code sous
 * les yeux : il nomme le cas et le geste de sortie.
 */

/** Un nom interne ou un libellé vide. */
export class PromotionBlankTextError extends DomainError {
  constructor(readonly field: string) {
    super(
      "promotions.blank_text",
      `Le champ « ${field} » de la promotion est vide : écrivez-le, ou laissez-le non renseigné s'il est facultatif.`,
    );
  }
}

/** Une fenêtre qui se ferme avant de s'ouvrir. */
export class PromotionReversedWindowError extends DomainError {
  constructor(
    readonly validFrom: Date,
    readonly validTo: Date,
  ) {
    super(
      "promotions.reversed_window",
      "La promotion se termine avant de commencer : choisissez une date de fin postérieure à la date de début.",
    );
  }
}

/** Une valeur d'effet hors de ce que l'effet admet. */
export class PromotionInvalidEffectError extends DomainError {
  constructor(
    readonly effectKind: string,
    readonly value: number,
    expectation: string,
  ) {
    super(
      "promotions.invalid_effect",
      `La valeur ${String(value)} ne convient pas à cet effet : ${expectation}.`,
    );
  }
}

/**
 * Un effet qui n'existe pas à ce point d'application : un prix posé ou une
 * remise unitaire n'a pas de sens sur un panier, un montant de panier n'en a
 * pas sur une ligne.
 */
export class PromotionEffectPointMismatchError extends DomainError {
  constructor(
    readonly effectKind: string,
    readonly point: string,
  ) {
    super(
      "promotions.effect_point_mismatch",
      point === "basket"
        ? "Une promotion liée à un acheminement s'applique au panier : elle ne peut être qu'un pourcentage ou un montant sur le panier."
        : "Une promotion sans acheminement s'applique à la ligne : un montant sur le panier n'y a pas de sens — choisissez un pourcentage, une remise unitaire ou un prix posé.",
    );
  }
}

/** Plancher propre ou cumul sur mercuriale sur une promotion de panier. */
export class PromotionLineOnlyOptionError extends DomainError {
  constructor(readonly option: "own_floor" | "stacks_over_mercuriale") {
    super(
      "promotions.line_only_option",
      option === "own_floor"
        ? "Un plancher propre ne s'applique qu'à une promotion sans acheminement : retirez le plancher, ou l'acheminement."
        : "« S'applique aussi aux tarifs négociés » ne vaut que pour une promotion sans acheminement : décochez-le, ou retirez l'acheminement.",
    );
  }
}

/** Un plancher propre mal formé. */
export class PromotionInvalidOwnFloorError extends DomainError {
  constructor(readonly value: number) {
    super(
      "promotions.invalid_own_floor",
      `Le plancher propre ${String(value)} n'est pas admis : un entier positif, et au plus 100 % pour un pourcentage.`,
    );
  }
}

/** Un public ou un acheminement dont l'identifiant manque. */
export class PromotionMissingTargetIdError extends DomainError {
  constructor(readonly axis: "company" | "pickup_point") {
    super(
      "promotions.missing_target_id",
      axis === "company"
        ? "Le public « une société » demande de choisir la société."
        : "L'acheminement « retrait à un point » demande de choisir le point de retrait.",
    );
  }
}

/** Une portée « seulement » qui n'inclut rien. */
export class PromotionScopeIncludesNothingError extends DomainError {
  constructor() {
    super(
      "promotions.scope_includes_nothing",
      "La portée « seulement » n'inclut aucune famille, aucun produit, aucune déclinaison : ajoutez-en une, ou passez en « tout sauf ».",
    );
  }
}

/** Une famille réglée à contre-sens du mode. */
export class PromotionCategoryAgainstModeError extends DomainError {
  constructor(
    readonly categoryId: string,
    readonly mode: string,
  ) {
    super(
      "promotions.category_against_mode",
      mode === "only"
        ? `La famille ${categoryId} est exclue d'une portée « seulement » : une famille ne s'y règle qu'en inclusion — excluez plutôt un produit.`
        : `La famille ${categoryId} est incluse dans une portée « tout sauf » : une famille ne s'y règle qu'en exclusion — réincluez plutôt un produit.`,
    );
  }
}

/** Une cible réglée deux fois. */
export class PromotionDuplicateScopeRuleError extends DomainError {
  constructor(
    readonly target: string,
    readonly targetId: string,
  ) {
    super(
      "promotions.duplicate_scope_rule",
      `La portée règle deux fois ${target} ${targetId} : gardez une seule règle.`,
    );
  }
}

/** Un rang de cible hors de l'échelle de la tarification. */
export class PromotionInvalidTargetRankError extends DomainError {
  constructor(
    readonly targetId: string,
    readonly rank: number,
  ) {
    super(
      "promotions.invalid_target_rank",
      `La règle de portée sur ${targetId} porte le rang ${String(rank)} : seule une déclinaison reprise d'une portée produit porte un rang (2).`,
    );
  }
}

/** Une condition mal formée. */
export class PromotionInvalidConditionError extends DomainError {
  constructor(
    readonly conditionKind: string,
    readonly value: number,
  ) {
    super(
      "promotions.invalid_condition",
      `La condition « quantité minimum » vaut ${String(value)} : elle doit être un entier d'au moins 1.`,
    );
  }
}

/** Toucher une promotion archivée. */
export class ArchivedPromotionIsSealedError extends BusinessError {
  constructor(readonly promotionId: string) {
    super(
      "promotions.archived_sealed",
      "Cette promotion est archivée : elle ne se modifie plus. Posez-en une nouvelle.",
    );
  }
}

/** Suspendre ce qui l'est déjà. */
export class PromotionAlreadyPausedError extends BusinessError {
  constructor(readonly promotionId: string) {
    super("promotions.already_paused", "Cette promotion est déjà suspendue.");
  }
}

/** Reprendre ce qui n'est pas suspendu. */
export class PromotionNotPausedError extends BusinessError {
  constructor(readonly promotionId: string) {
    super(
      "promotions.not_paused",
      "Cette promotion n'est pas en pause : il n'y a rien à reprendre.",
    );
  }
}

/** Archiver sans motif. */
export class PromotionArchiveReasonMissingError extends DomainError {
  constructor() {
    super(
      "promotions.archive_reason_missing",
      "Archiver une promotion demande un motif : écrivez pourquoi elle s'arrête.",
    );
  }
}

/** Une ligne en base que le domaine ne sait pas relire. */
export class UnreadablePromotionRowError extends TechnicalError {
  constructor(
    readonly promotionId: string,
    readonly detail: string,
  ) {
    super(
      "promotions.unreadable_row",
      `La promotion ${promotionId} est illisible en base (${detail}) : elle ne peut pas être chargée tant que la ligne n'est pas corrigée.`,
    );
  }
}

/** Une promotion introuvable. */
export class PromotionNotFoundError extends ResourceNotFoundError {
  constructor(readonly promotionId: string) {
    super("promotions.not_found", `Aucune promotion ${promotionId} : elle n'existe pas.`);
  }
}
