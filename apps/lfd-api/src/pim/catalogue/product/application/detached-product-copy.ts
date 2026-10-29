import type { VariantNutritionSnapshot } from "../domain/entities/variant.js";
import type { ProductEditorialView, ProductMediaRecord } from "../domain/ports/editorial-reader.js";
import {
  editorial,
  mediaItems,
  type Editorial,
  type MediaItem,
} from "../domain/value-objects/editorial.js";
import {
  nutritionValues,
  type NutritionValues,
} from "../domain/value-objects/nutrition-declaration.js";

/**
 * Les copies que le détachement d'une déclinaison fait de sa fiche d'origine
 * (`plan-gestes-de-declinaison.md`, D3) — ce que la fiche lit en `null`, et ce
 * que ses ports d'écriture attendent absent. Repassées par leurs fabriques :
 * une copie ne contourne pas la validation qu'un enregistrement subirait.
 */

/** Les textes de la fiche — un champ `null` est un champ absent. */
export function copiedEditorial(view: ProductEditorialView | null): Editorial {
  if (view === null) {
    return editorial({});
  }
  return editorial({
    descriptionShort: view.descriptionShort ?? undefined,
    descriptionLong: view.descriptionLong ?? undefined,
    story: view.story ?? undefined,
    pairing: view.pairing ?? undefined,
    brand: view.brand ?? undefined,
    seoTitle: view.seoTitle ?? undefined,
    seoDescription: view.seoDescription ?? undefined,
  });
}

/** Les visuels, dans leur ordre : la même image, le même rôle. */
export function copiedMedia(records: readonly ProductMediaRecord[]): MediaItem[] {
  return mediaItems(records.map((record) => ({ role: record.role, url: record.url })));
}

/** Les valeurs pour 100 g — une valeur `null` n'a pas été saisie. */
export function copiedNutrition(values: VariantNutritionSnapshot): NutritionValues {
  return nutritionValues({
    energyKcal: values.energyKcal ?? undefined,
    fatG: values.fatG ?? undefined,
    saturatedFatG: values.saturatedFatG ?? undefined,
    carbsG: values.carbsG ?? undefined,
    sugarsG: values.sugarsG ?? undefined,
    proteinG: values.proteinG ?? undefined,
    saltG: values.saltG ?? undefined,
    glycemicIndex: values.glycemicIndex ?? undefined,
  });
}
