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

/** Une option du seul point ligne, posée sur une promotion de panier. */
export type LineOnlyOption = "own_floor" | "stacks_over_mercuriale";

const LINE_ONLY_MESSAGES: Readonly<Record<LineOnlyOption, string>> = {
  own_floor:
    "Un plancher propre ne s'applique qu'à une promotion sans acheminement : retirez le plancher, ou l'acheminement.",
  stacks_over_mercuriale:
    "« S'applique aussi aux tarifs négociés » ne vaut que pour une promotion sans acheminement : décochez-le, ou retirez l'acheminement.",
};

/**
 * Plancher propre ou cumul sur mercuriale sur une promotion de panier.
 * « Cumulable » y est admise depuis M7 (plan des promotions, § 18.6).
 */
export class PromotionLineOnlyOptionError extends DomainError {
  constructor(readonly option: LineOnlyOption) {
    super("promotions.line_only_option", LINE_ONLY_MESSAGES[option]);
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

/**
 * La ligne `promotions_source` manque ou ne vaut pas `promotions`. Depuis
 * L12, c'est un garde-fou (CHECK de la migration
 * `20261031150000_le_resserrement_des_promotions`) : son absence ou une
 * autre valeur est une base à réparer, jamais un chemin à servir.
 */
export class PromotionsSourceUnreadableError extends TechnicalError {
  constructor(readonly found: string | null) {
    super(
      "promotions.source_unreadable",
      found === null
        ? "La ligne de configuration « promotions_source » est absente : aucun prix ne peut être calculé tant qu'elle n'est pas remise à « promotions » (cf. la migration 20261031150000_le_resserrement_des_promotions)."
        : `La ligne de configuration « promotions_source » vaut « ${found} » : l'ancien chemin de calcul est retiré, seule « promotions » est servie. Remettez « promotions ».`,
    );
  }
}

/**
 * Une cible `product` sur une promotion de LIGNE (décidé le 2026-10-30, lot
 * L7, mandat de Hugo). Le tarif est à plat : toute décision du prix d'une
 * ligne vise UNE référence de vente (`pricing-context.ts`), et la chaîne de
 * prix ne connaît que le SKU. « Toutes les déclinaisons d'un produit » n'a de
 * sens qu'au panier, où l'article est rangé au catalogue.
 */
export class PromotionProductTargetAtLineError extends DomainError {
  constructor(readonly productId: string) {
    super(
      "promotions.product_target_at_line",
      "Une promotion sans acheminement agit sur le prix de chaque déclinaison : elle ne peut pas viser un produit entier. Visez la famille ou la déclinaison.",
    );
  }
}

/**
 * Deux promotions qui se disputeraient un même article (plan, § 13.2,
 * CHEVAUCHEMENT) : même point d'application, publics qui se croisent, même acheminement,
 * fenêtres qui se recouvrent, un article vendable en commun.
 */
export class OverlappingPromotionError extends BusinessError {
  constructor(
    readonly otherPromotionId: string,
    otherName: string,
    commonPublic: string,
    articleName: string,
    period: string,
  ) {
    super(
      "promotions.overlapping",
      `« ${otherName} » vise déjà ${commonPublic} et couvre ${articleName} ${period} : raccourcissez l'une des deux, retirez ce public de l'une, ou excluez l'article.`,
    );
  }
}

/**
 * Deux promotions de panier qui pourraient s'appliquer à une même commande
 * (plan, § 13.2) : la commande ne compose qu'une remise de panier jusqu'au
 * lot L12.
 */
export class BasketPromotionsWouldCombineError extends BusinessError {
  constructor(
    readonly otherPromotionId: string,
    otherName: string,
  ) {
    super(
      "promotions.basket_would_combine",
      `« ${otherName} » pourrait s'appliquer à la même commande : une commande ne porte qu'une promotion liée à l'acheminement, sauf si les deux sont « Cumulable ». Cochez « Cumulable » sur les deux, ou changez le public, l'acheminement ou les dates de l'une d'elles.`,
    );
  }
}

/**
 * Une promotion réglée depuis la mauvaise surface (plan, § 13.9 et § 14
 * S-droits) : celle d'un point de retrait se règle depuis ce point, les
 * autres depuis la tarification — chacune sous son droit.
 */
export class PromotionWrongSurfaceError extends BusinessError {
  constructor(
    readonly promotionId: string | null,
    expected: "pickup_point" | "pricing",
  ) {
    super(
      "promotions.wrong_surface",
      expected === "pickup_point"
        ? "Une promotion de retrait à un point se règle depuis ce point de retrait : ouvrez-la depuis la fiche du site."
        : "Cette promotion ne vise pas ce point de retrait : réglez-la depuis l'écran Promotions, ou choisissez « retrait à ce point ».",
    );
  }
}

/**
 * Un ancien éditeur des promotions, fermé par la bascule (plan, § 13.10, L8) :
 * le calcul ne lit plus ni les règles d'étage promotion ni la remise d'un
 * site — une écriture y serait acceptée sans agir sur aucun prix.
 */
export class LegacyPromotionEditorClosedError extends BusinessError {
  constructor(readonly editor: "price_rule" | "site_discount") {
    super(
      "promotions.legacy_editor_closed",
      editor === "price_rule"
        ? "Les promotions se règlent désormais dans l'écran Promotions : une règle d'étage promotion ne s'écrit plus et n'agit plus sur aucun prix. Posez-y une promotion, ou choisissez un autre étage."
        : "La remise d'un site se règle désormais dans l'écran Promotions : depuis la fiche du site, « Nouvelle promotion pour ce site ». Ses anciennes colonnes n'agissent plus sur aucun prix.",
    );
  }
}

/**
 * **Une sixième promotion panier cumulable sur une même commande** (lot M7,
 * décision du 2026-10-31) : une commande porte cinq remises de panier au
 * plus ; le refus nomme celles qui s'appliqueraient déjà.
 */
export class TooManyCumulativeBasketPromotionsError extends BusinessError {
  constructor(
    readonly companionNames: readonly string[],
    readonly maximum: number,
  ) {
    super(
      "promotions.too_many_cumulative_basket",
      `Une commande porte ${maximum} remises de panier au plus, et ${companionNames.length} promotions cumulables ` +
        `pourraient déjà s'appliquer avec celle-ci (${companionNames.map((name) => `« ${name} »`).join(", ")}). ` +
        "Décochez « Cumulable », ou archivez l'une d'elles, ou changez le public, l'acheminement ou les dates.",
    );
  }
}
