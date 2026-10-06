import { BinFormat } from "../../value-objects/bin-format.js";
import type { BinTypeDimensionsInput } from "../../value-objects/bin-type-dimensions.js";

/**
 * **La géométrie d'un format, en millimètres** — ce que `maximizeFormat`
 * calcule. Depuis le 2026-10-07, un type de bac, un candidat de la
 * bibliothèque et un format saisi dans l'assistant se mesurent tous au
 * millimètre : plus aucune conversion ici, elle ne reste qu'au plancher.
 */
export interface FormatGeometry {
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly maxStack: number;
}

/**
 * Une géométrie relue (type de bac, candidat), revalidée par les règles du
 * type par `BinFormat` : bornes en mm, intérieur dans l'extérieur, pile.
 *
 * @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
 * @throws {InvalidBinMaxStackError}
 */
export function geometryOf(input: FormatGeometry): FormatGeometry {
  return geometryOfFormat(BinFormat.of(input));
}

/** Un format déjà validé, tel que le calcul le lit. */
export function geometryOfFormat(format: BinFormat): FormatGeometry {
  return {
    outer: format.outer.toInput(),
    inner: format.inner.toInput(),
    maxStack: format.maxStack,
  };
}
