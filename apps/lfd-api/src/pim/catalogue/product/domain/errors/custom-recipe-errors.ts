import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * **Le défaut d'une fiche sans vignettes ne peut pas être sur mesure**
 * (`plan-sur-mesure-par-declinaison.md`, V5, option (a) décidée par Hugo le
 * 2026-11-18).
 *
 * Une fiche qui ne montre pas chaque déclinaison en vignette ne paraît au
 * rayon que par son défaut : sur mesure, il disparaîtrait pour tous les pros
 * sans réservation, et ses autres déclinaisons, pourtant ouvertes, avec lui.
 * Trois gestes y mènent — cocher le défaut, décocher les vignettes, changer de
 * défaut — et tous trois lèvent ce refus. Un 409 : la demande est bien formée,
 * c'est l'état de la fiche qui la refuse.
 */
export class CustomRecipeDefaultWithoutTilesError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.custom_recipe_default_without_tiles",
      `La déclinaison « ${variantSku} » serait la déclinaison par défaut, sur mesure, d'une ` +
        "fiche qui ne montre que son défaut au rayon : la fiche disparaîtrait pour tous les " +
        "pros. Le défaut d'une fiche sans vignettes ne peut pas être sur mesure : cochez " +
        "« Montrer chaque déclinaison en vignette », ou choisissez un autre défaut.",
    );
  }
}
