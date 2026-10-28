import { Prisma } from "../../../platform/database/client/client.js";
import type { PimFacts } from "../domain/entities/catalog-item.js";

/**
 * **Les colonnes de faits d'un article** — ce que le référentiel décide, et
 * rien d'autre : ni décision locale, ni retrait.
 *
 * Partagé par les deux écrivains du miroir : l'enregistrement d'un agrégat
 * (`PrismaCatalogItemRepository`) et le récepteur des faits du référentiel
 * (`PrismaCatalogProductFactsProjection`, lot 2a). Deux copies de cette liste
 * finiraient par écrire un champ chacune — c'est l'endroit du dépôt où un
 * champ oublié compile.
 */
export function pimFactsColumns(facts: PimFacts) {
  return {
    productId: facts.productId,
    productSku: facts.productSku,
    name: facts.name,
    kind: facts.kind,
    categoryId: facts.categoryId,
    priceMillicents: facts.priceMillicents,
    weightGrams: facts.weightGrams,
    isDefault: facts.isDefault,
    position: facts.position,
    vatRatePercent: facts.vatRatePercent,
    // `?? Prisma.DbNull` : sans ça, `undefined` laisserait la colonne INCHANGÉE
    // sur un upsert, et un article dont la fiche a été retirée dans le PIM
    // garderait ses anciens allergènes.
    allergens: facts.allergens ?? Prisma.DbNull,
    // Même repli, même raison : `undefined` laisserait la colonne inchangée sur
    // un upsert, et un article dont la fiche a été retirée dans le PIM garderait
    // des mentions d'étiquette que plus rien ne déclare.
    note: facts.note,
    imageUrl: facts.image?.url ?? null,
    imageAlt: facts.image?.alt ?? null,
    imageWidth: facts.image?.width ?? null,
    imageHeight: facts.image?.height ?? null,
    imageFocalX: facts.image?.focal?.x ?? null,
    imageFocalY: facts.image?.focal?.y ?? null,
    // `?? null` et non `undefined` : sur un upsert, `undefined` laisserait la
    // colonne INCHANGÉE, et un article dont la fiche a perdu sa vignette
    // garderait celle d'avant. Même repli, même raison que les allergènes.
    thumbnailUrl: facts.thumbnail?.url ?? null,
    thumbnailAlt: facts.thumbnail?.alt ?? null,
    thumbnailWidth: facts.thumbnail?.width ?? null,
    thumbnailHeight: facts.thumbnail?.height ?? null,
    thumbnailFocalX: facts.thumbnail?.focal?.x ?? null,
    thumbnailFocalY: facts.thumbnail?.focal?.y ?? null,
    orderLimitDaysBefore: facts.orderTimeLimit?.daysBefore ?? null,
    orderLimitTime: facts.orderTimeLimit?.time ?? null,
    orderLimitGraceMinutes: facts.orderTimeLimit?.graceMinutes ?? null,
    publicTtcCents: facts.publicTtcCents,
    proPricePerKgMillicents: facts.proPricePerKgMillicents,
    publicPricePerKgTtcCents: facts.publicPricePerKgTtcCents,
    saleUnit: facts.saleUnit,
    weightMinGrams: facts.weightMinGrams,
    weightStepGrams: facts.weightStepGrams,
    // `DbNull` et non `JsonNull` : c'est l'ABSENCE de la donnée, pas un `null`
    // JSON stocké — la même distinction que pour les mentions d'étiquette.
    publicByContext:
      facts.publicByContext === null
        ? Prisma.DbNull
        : Object.fromEntries(
            // Recopié champ par champ plutôt qu'étalé : le document écrit doit
            // être exactement celui que le mapper de lecture sait relire, et
            // un objet du domaine porte des `readonly` que l'ORM refuse.
            Object.entries(facts.publicByContext).map(([key, price]) => [
              key,
              { vatRatePercent: price.vatRatePercent, htMillicents: price.htMillicents },
            ]),
          ),
    allergenLabels:
      facts.allergenLabels === null
        ? Prisma.DbNull
        : {
            labels: facts.allergenLabels.labels.map((entry) => ({
              category: entry.category,
              label: entry.label,
            })),
            incomplete: facts.allergenLabels.incomplete,
          },
    // `DbNull` comme `allergens` : l'absence de la donnée, pas un `null` JSON.
    mayContain: facts.mayContain === null ? Prisma.DbNull : [...facts.mayContain],
    allergensPrecautionary: facts.allergensPrecautionary,
    // `DbNull` : l'absence de la donnée. Recopié liste par liste, comme
    // `publicByContext` : l'ORM refuse les `readonly` du domaine.
    allergenTexts:
      facts.allergenTexts === null
        ? Prisma.DbNull
        : Object.fromEntries(
            Object.entries(facts.allergenTexts).map(([language, texts]) => [
              language,
              { contains: [...texts.contains], mayContain: [...texts.mayContain] },
            ]),
          ),
    operationOnly: facts.operationOnly,
    requiresCold: facts.requiresCold,
    receivedAt: facts.receivedAt,
  };
}
