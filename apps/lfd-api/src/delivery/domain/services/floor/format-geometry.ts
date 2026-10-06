import { ensureInnerFits, ensureMaxStack } from "../../entities/bin-type.js";
import type { BinFormat } from "../../value-objects/bin-format.js";
import {
  BinTypeDimensions,
  type BinTypeDimensionsInput,
  centimetresLabel,
  MM_PER_CM,
} from "../../value-objects/bin-type-dimensions.js";

/**
 * **La géométrie d'un format, en millimètres** — ce que `maximizeFormat`
 * calcule (2026-10-07). Deux sources : un TYPE de bac, déjà au millimètre, et
 * un format en centimètres entiers (candidat de la bibliothèque, format saisi
 * dans l'assistant), converti ×10 — sans perte.
 */
export interface FormatGeometry {
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly maxStack: number;
}

/** Un format en centimètres entiers, déjà validé par `BinFormat`. */
export function geometryOfFormat(format: BinFormat): FormatGeometry {
  const mm = (side: BinFormat["outer"]): BinTypeDimensionsInput => ({
    lengthMm: side.lengthCm * MM_PER_CM,
    widthMm: side.widthCm * MM_PER_CM,
    heightMm: side.heightCm * MM_PER_CM,
  });
  return { outer: mm(format.outer), inner: mm(format.inner), maxStack: format.maxStack };
}

/**
 * Un type de bac relu, revalidé par les règles du type : bornes en mm,
 * intérieur dans l'extérieur, pile.
 *
 * @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
 * @throws {InvalidBinMaxStackError}
 */
export function geometryOfBinType(input: FormatGeometry): FormatGeometry {
  const outer = BinTypeDimensions.of("extérieures", input.outer);
  const inner = BinTypeDimensions.of("intérieures", input.inner);
  ensureInnerFits(
    { length: inner.lengthMm, width: inner.widthMm, height: inner.heightMm },
    { length: outer.lengthMm, width: outer.widthMm, height: outer.heightMm },
    centimetresLabel,
  );
  return {
    outer: outer.toInput(),
    inner: inner.toInput(),
    maxStack: ensureMaxStack(input.maxStack),
  };
}
