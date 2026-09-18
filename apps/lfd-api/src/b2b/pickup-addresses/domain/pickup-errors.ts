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
 * Suppression refusée : c'est le **dernier** point de retrait. Refus **métier**
 * (409) — au moins un point doit subsister pour que le retrait reste possible.
 */
export class LastPickupAddressError extends BusinessError {
  constructor() {
    super(
      "pickup.last",
      "Impossible de supprimer le dernier point de retrait : il en faut au moins un.",
    );
  }
}

/**
 * Une réduction de retrait qui ne vise **aucune clientèle** (**400**) : elle ne
 * s'appliquerait à personne, et l'écran afficherait une remise que la caisse
 * n'accorde jamais. Le geste de sortie est dans le message.
 */
export class PickupDiscountWithoutAudienceError extends DomainError {
  constructor() {
    super("pickup.discount.no_audience", "Cochez au moins une clientèle, ou retirez la réduction.");
  }
}

/**
 * Les refus des **créneaux publics** — plan
 * `documentation/order/plan-creneaux-de-retrait.md`, D2 et D7.
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
