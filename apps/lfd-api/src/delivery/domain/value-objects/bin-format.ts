import { type BoxSides, ensureInnerFits, ensureMaxStack } from "../entities/bin-type.js";
import {
  BinTypeDimensions,
  type BinTypeDimensionsInput,
  centimetresLabel,
} from "./bin-type-dimensions.js";

/** Ce que la saisie dit d'un format de bac essayé dans l'assistant, en millimètres. */
export interface BinFormatInput {
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly maxStack: number;
}

/**
 * **Un format de bac essayé** (G-D3) : la part géométrique d'un `BinType`,
 * sans identité ni cycle de vie — l'assistant compare des bacs qu'on n'a pas
 * encore achetés. Les règles sont CELLES du type de bac (bornes en mm,
 * intérieur dans l'extérieur, pile), appelées plutôt que recopiées.
 */
export class BinFormat {
  private constructor(
    readonly outer: BinTypeDimensions,
    readonly inner: BinTypeDimensions,
    readonly maxStack: number,
  ) {}

  /**
   * @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
   * @throws {InvalidBinMaxStackError}
   */
  static of(input: BinFormatInput): BinFormat {
    const outer = BinTypeDimensions.of("extérieures", input.outer);
    const inner = BinTypeDimensions.of("intérieures", input.inner);
    ensureInnerFits(sidesOf(inner), sidesOf(outer), centimetresLabel);
    return new BinFormat(outer, inner, ensureMaxStack(input.maxStack));
  }
}

function sidesOf(dimensions: BinTypeDimensions): BoxSides {
  return { length: dimensions.lengthMm, width: dimensions.widthMm, height: dimensions.heightMm };
}
