import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** Le point de retrait visé n'existe pas (**404**). */
export class PickupAddressNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("pickup.not_found", "Point de retrait introuvable.");
  }
}

/**
 * Une remise « seulement » qui n'inclut rien (**400**) : elle ne porterait sur
 * aucune ligne, et l'écran afficherait une remise que la caisse n'accorde
 * jamais — le pendant, depuis le 2026-10-22, de la remise sans clientèle.
 */
export class PickupDiscountScopeIncludesNothingError extends DomainError {
  constructor(readonly audienceLabel: string) {
    super(
      "pickup.discount.only_includes_nothing",
      `La remise ${audienceLabel} ne porte que sur les articles choisis, et aucun n'est choisi : ajoutez une famille ou un produit, ou passez-la sur « tous les articles sauf ».`,
    );
  }
}

/** La même famille ou le même produit réglé deux fois dans une remise (**400**). */
export class PickupDiscountDuplicateRuleError extends DomainError {
  constructor(
    readonly audienceLabel: string,
    readonly targetId: string,
  ) {
    super(
      "pickup.discount.duplicate_rule",
      `La remise ${audienceLabel} règle deux fois « ${targetId} » : gardez une seule règle pour cet article ou cette famille.`,
    );
  }
}

/**
 * Une famille réglée à contre-sens du mode de la remise (**400**) : incluse
 * en « tous les articles sauf », ou exclue en « seulement ». Seul un produit
 * peut aller contre sa famille (Q1, Hugo 2026-10-23).
 */
export class PickupDiscountCategoryReinclusionError extends DomainError {
  constructor(
    readonly audienceLabel: string,
    readonly scope: "all_except" | "only",
    readonly categoryId: string,
  ) {
    super(
      "pickup.discount.category_against_scope",
      scope === "all_except"
        ? `La remise ${audienceLabel} porte sur tous les articles sauf ceux exclus, et la famille « ${categoryId} » y est incluse : retirez cette règle de famille, ou réincluez les produits voulus un par un.`
        : `La remise ${audienceLabel} ne porte que sur les articles choisis, et la famille « ${categoryId} » y est exclue : retirez cette règle de famille, ou excluez les produits voulus un par un.`,
    );
  }
}

/**
 * Les refus des **créneaux publics** — plan
 * `documentation/commandes/passation/plan-creneaux-de-retrait.md`, D2 et D7.
 *
 * Quatre d'entre eux portent sur UNE règle et vivent donc dans son value object ;
 * seul le chevauchement porte sur l'ensemble, et c'est lui qui justifie
 * l'agrégat. Tous nomment le geste de sortie : ils sont lus par du personnel qui
 * n'a pas le réglage sous les yeux.
 */

/** La plage d'une règle est vide ou à l'envers (**400**). */
export class PublicPickupSlotRangeError extends DomainError {
  constructor(start: string, end: string) {
    super(
      "pickup.public_slots.range",
      `La plage ${start}–${end} ne va nulle part : mettez une fin postérieure au début.`,
    );
  }
}

/**
 * La découpe ne produit **aucun** créneau (**400**) : un pas plus long que la
 * plage rendrait une règle qui n'ouvre rien, et l'écran l'afficherait comme
 * ouverte.
 */
export class PublicPickupSlotStepError extends DomainError {
  constructor(slotMinutes: number, start: string, end: string) {
    super(
      "pickup.public_slots.step",
      `Un créneau de ${String(slotMinutes)} min ne tient pas dans la plage ${start}–${end} : ` +
        `raccourcissez la durée ou élargissez la plage.`,
    );
  }
}

/**
 * Un badge **vide** (**400**). `null` dit « pas de pastille », une valeur dit ce
 * qu'elle dit — la chaîne vide dirait une troisième chose que personne ne sait
 * lire (D2, vitruve S10).
 */
export class PublicPickupBadgeEmptyError extends DomainError {
  constructor() {
    super(
      "pickup.public_slots.badge_empty",
      "Un badge vide ne veut rien dire : écrivez-en un, ou laissez la case sans badge.",
    );
  }
}

/**
 * Une capacité de service **nulle ou négative** (**400**). Le champ naît vide, et
 * vide vaut « aucune limite » : `0` fermerait un créneau au lieu de l'ouvrir
 * sans borne, ce qui est l'inverse du défaut voulu (D3).
 */
export class PublicPickupServiceCapacityError extends DomainError {
  constructor(capacity: number) {
    super(
      "pickup.public_slots.capacity",
      `Une capacité de ${String(capacity)} ne sert personne : laissez la case vide pour ne poser aucune limite.`,
    );
  }
}

/** Une fermeture dont les jours ou les heures ne tiennent pas debout (**400**). */
export class PublicPickupClosurePeriodError extends DomainError {
  constructor(reason: string) {
    super("pickup.public_slots.closure_period", `Fermeture impossible à poser : ${reason}`);
  }
}

/**
 * Deux règles du même point **se chevauchent** (**409**).
 *
 * Le SEUL invariant inter-règles, et donc la seule raison d'être de l'agrégat
 * (D7) : deux plages qui se recouvrent offriraient la même heure deux fois, avec
 * deux badges et deux capacités, sans que rien ne dise laquelle gagne.
 */
export class PublicPickupSlotRulesOverlapError extends BusinessError {
  constructor(first: string, second: string) {
    super(
      "pickup.public_slots.overlap",
      `Les plages ${first} et ${second} se chevauchent : ajustez leurs bornes, ou n'en gardez qu'une.`,
    );
  }
}
