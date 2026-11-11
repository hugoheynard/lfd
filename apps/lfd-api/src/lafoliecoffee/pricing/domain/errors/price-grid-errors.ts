import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la grille de prix (`export-grille-de-prix.md`). Chacun nomme
 * le cas et le geste : ils sont lus dans le panneau d'export, par l'équipe.
 */

/** La société choisie n'existe pas — l'écran l'a sans doute gardée d'avant. */
export class PriceGridCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "pricing.price_grid.company_not_found",
      "La société choisie pour la grille de prix est introuvable. Rechoisissez-la dans la liste.",
    );
  }
}

/** Le point de retrait choisi n'existe pas, ou plus. */
export class PriceGridPickupNotFoundError extends ResourceNotFoundError {
  constructor(readonly pickupId: string) {
    super(
      "pricing.price_grid.pickup_not_found",
      "Le point de retrait choisi pour la grille de prix est introuvable. Rechoisissez-le.",
    );
  }
}

/** La zone de livraison choisie n'existe pas, ou plus. */
export class PriceGridZoneNotFoundError extends ResourceNotFoundError {
  constructor(readonly zoneId: string) {
    super(
      "pricing.price_grid.zone_not_found",
      "La zone de livraison choisie pour la grille de prix est introuvable. Rechoisissez-la.",
    );
  }
}

/** Un jour qui n'existe pas à Paris (mal formé). */
export class PriceGridInvalidDayError extends DomainError {
  constructor(readonly day: string) {
    super(
      "pricing.price_grid.invalid_day",
      `Le jour « ${day} » n'est pas une date valide. Choisissez une date au calendrier.`,
    );
  }
}

/**
 * **Une grille passée pour un particulier** : l'historique des tarifs ne garde
 * que le prix professionnel (`architecture-la-porte-du-prix.md`, § 1 — la
 * figure de `DatedPublicPriceUnsupportedError`). Rendre le prix public du jour
 * à sa place serait un chiffre plausible et faux.
 */
export class PriceGridDatedPublicError extends DomainError {
  constructor(readonly day: string) {
    super(
      "pricing.price_grid.dated_public_unsupported",
      `La grille des particuliers au ${day} ne peut pas être reconstituée : l'historique des ` +
        "tarifs ne garde que le prix professionnel. Choisissez aujourd'hui ou une date à venir.",
    );
  }
}

/**
 * Une remise au panier retenue que ce public ne reçoit pas à cette date et
 * pour cet acheminement — le panneau a été rempli avant un changement.
 */
export class PriceGridPromotionNotApplicableError extends BusinessError {
  constructor(readonly promotionId: string) {
    super(
      "pricing.price_grid.promotion_not_applicable",
      "Une remise au panier cochée ne s'applique pas à ce public, à cette date et pour cet " +
        "acheminement (elle a pu changer entre-temps). Rouvrez le panneau pour relire la liste.",
    );
  }
}
