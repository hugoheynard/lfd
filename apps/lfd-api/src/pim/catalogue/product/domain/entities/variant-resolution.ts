import { alignedAllergenSheet } from "../services/aligned-allergen-sheet.js";
import { NO_MIN_QUANTITIES, type MinQuantities } from "../value-objects/min-quantities.js";
import type { Variant, VariantSnapshot } from "./variant.js";

/**
 * Ce que le défaut prête à une déclinaison alignée, section par section.
 *
 * C'est la seule résolution du référentiel : le jugement, l'encart de
 * composition, la projection des canaux et l'empreinte de révision la lisent
 * tous, pour ne jamais donner deux réponses. Trois sections, dont les deux
 * moitiés de la fiche réglementaire, qui s'enregistrent et s'héritent
 * séparément (un format différent de la même pâte suit les allergènes du
 * défaut, pas ses valeurs). Le prix et le poids voyagent ensemble : c'est le
 * couple que la section « Tarif » enregistre.
 */
export function resolveVariant(variant: Variant, defaultVariant: Variant): VariantSnapshot {
  const own = variant.snapshot();
  const source = defaultVariant.snapshot();
  // Chaque moitié vient EN ENTIER de celui que SON drapeau désigne. Les traces
  // « peut contenir » voyagent avec les allergènes et non avec les valeurs :
  // ce sont des allergènes, et les faire suivre le mauvais drapeau mettrait sur
  // une étiquette la trace d'un autre article.
  const valuesFrom = variant.follows("nutrition") ? source : own;
  const pricing = variant.follows("pricing")
    ? {
        priceCents: source.priceCents,
        weightGrams: source.weightGrams,
        proPriceMillicents: source.proPriceMillicents,
        proPricePerKgMillicents: source.proPricePerKgMillicents,
        publicPricePerKgTtcCents: source.publicPricePerKgTtcCents,
        pricePerKgShownPublic: source.pricePerKgShownPublic,
        pricePerKgShownPro: source.pricePerKgShownPro,
      }
    : {};
  return {
    ...own,
    allergenSheet: alignedAllergenSheet(own, source),
    nutrition: valuesFrom.nutrition,
    ...pricing,
    minQuantities: effectiveMinQuantities(own, source),
  };
}

/**
 * La quantité minimale **effective** d'une déclinaison : la sienne, ou celle
 * du défaut si elle le suit — et jamais aucune au poids, dont le minimum est en
 * grammes. Le poids se juge sur ELLE : une déclinaison passée au poids après
 * avoir posé une grille ne la sert plus.
 */
function effectiveMinQuantities(own: VariantSnapshot, source: VariantSnapshot): MinQuantities {
  if (own.saleUnit === "weight") {
    return NO_MIN_QUANTITIES;
  }
  return own.minQuantityFollowsDefault ? source.minQuantities : own.minQuantities;
}
