import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Pourquoi des jours et heures sont refusés à la pose. */
export type PromotionHoursFault =
  | "no_window"
  | "no_weekday"
  | "duplicate_weekday"
  | "malformed_hour"
  | "reversed"
  | "overlap"
  | "repeated";

const HOURS_MESSAGES: Readonly<Record<PromotionHoursFault, (detail: string) => string>> = {
  no_window: () =>
    "La condition « jours et heures » n'a aucune plage : ajoutez-en une, ou retirez la condition.",
  no_weekday: (detail) =>
    `La plage ${detail} n'a aucun jour : cochez au moins un jour, ou retirez la plage.`,
  duplicate_weekday: (detail) => `La plage ${detail} : décochez le doublon.`,
  malformed_hour: (detail) =>
    `L'heure « ${detail} » n'est pas une heure : écrivez-la au format HH:MM (de 00:00 à 23:59, 24:00 pour finir à minuit).`,
  reversed: (detail) =>
    `La plage ${detail} finit avant de commencer ou en même temps : une plage ne passe pas minuit, ` +
    "découpez-la en deux (jusqu'à 24:00, puis dès 00:00 le lendemain).",
  overlap: (detail) =>
    `${detail} se chevauchent : un même jour, deux plages ne se recouvrent pas — fusionnez-les.`,
  repeated: () =>
    "La promotion porte deux conditions « jours et heures » : réunissez leurs plages en une seule condition.",
};

/**
 * **Des jours et heures mal posés** (`documentation/promotions/plan-jours-et-heures.md`,
 * § 3 et § 8) — refusés à la pose, à la révision et à la relecture.
 */
export class PromotionInvalidHoursError extends DomainError {
  constructor(
    readonly fault: PromotionHoursFault,
    readonly detail: string = "",
  ) {
    super("promotions.invalid_hours", HOURS_MESSAGES[fault](detail));
  }
}

/**
 * **Une promotion à heures « dans le prix affiché »** (plan jours et heures,
 * § 8.4, § 10.2 et § 11) : le rayon ne connaît pas de créneau, et une ligne à
 * moitié dans la plage aurait deux prix pour un même article.
 */
export class PromotionHoursAtDisplayedPriceError extends DomainError {
  constructor() {
    super(
      "promotions.hours_at_displayed_price",
      "Une promotion à jours et heures est une remise au panier : choisissez « au retrait » ou " +
        "« en livraison » plutôt que « dans le prix affiché », ou retirez les jours et heures.",
    );
  }
}
