import type { SaleUnit } from "../value-objects/sale-terms.js";
import type { VariantSnapshot } from "./variant-snapshot.js";

/**
 * **Ce que la section « Tarif & logistique » possède**, pour une déclinaison :
 * les champs dont un changement se trace au journal.
 *
 * Le prix pro y porte la clé de la révision et du contrat du fait,
 * `proPriceMillicents`, pour que l'attribution le lise tel quel. Les prix au
 * kilo, les cases « afficher aux particuliers / aux pros », l'unité de vente
 * et son pas y sont tous : sans l'un d'eux, une saisie qui ne touche que lui
 * serait enregistrée sans trace (`saisir-un-prix.md`, `vente-au-poids.md`).
 */
export interface VariantPricingSection {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly proPriceMillicents: number | null;
  readonly proPricePerKgMillicents: number | null;
  readonly publicPricePerKgTtcCents: number | null;
  readonly pricePerKgShownPublic: boolean;
  readonly pricePerKgShownPro: boolean;
  readonly saleUnit: SaleUnit;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
}

/**
 * La section lue sur l'instantané **résolu** d'une déclinaison — une alignée
 * montre le tarif du défaut, celui que l'écran affiche. Une déclinaison
 * absente rend la section vide, à ses valeurs par défaut.
 */
export function pricingSectionOf(variant: VariantSnapshot | undefined): VariantPricingSection {
  return {
    priceCents: variant?.priceCents ?? null,
    weightGrams: variant?.weightGrams ?? null,
    proPriceMillicents: variant?.proPriceMillicents ?? null,
    proPricePerKgMillicents: variant?.proPricePerKgMillicents ?? null,
    publicPricePerKgTtcCents: variant?.publicPricePerKgTtcCents ?? null,
    pricePerKgShownPublic: variant?.pricePerKgShownPublic ?? true,
    pricePerKgShownPro: variant?.pricePerKgShownPro ?? true,
    saleUnit: variant?.saleUnit ?? "piece",
    weightMinGrams: variant?.weightMinGrams ?? null,
    weightStepGrams: variant?.weightStepGrams ?? null,
  };
}
