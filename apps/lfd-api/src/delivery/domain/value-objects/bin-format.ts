import { BIN_MAX_STACK_MAX, BIN_MAX_STACK_MIN, ensureInnerFits } from "../entities/bin-type.js";
import { InvalidBinMaxStackError } from "../errors/delivery-bin-errors.js";
import { BinDimensions, type BinDimensionsInput } from "./bin-dimensions.js";

/** Ce que la saisie dit d'un format de bac essayé dans l'assistant. */
export interface BinFormatInput {
  readonly outer: BinDimensionsInput;
  readonly inner: BinDimensionsInput;
  readonly maxStack: number;
}

/**
 * **Un format de bac essayé** (G-D3) : la part géométrique d'un `BinType`,
 * sans identité ni cycle de vie — l'assistant compare des bacs qu'on n'a pas
 * encore achetés. Les règles sont CELLES du type de bac (bornes, intérieur
 * dans l'extérieur, pile), appelées plutôt que recopiées.
 */
export class BinFormat {
  private constructor(
    readonly outer: BinDimensions,
    readonly inner: BinDimensions,
    readonly maxStack: number,
  ) {}

  /**
   * @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
   * @throws {InvalidBinMaxStackError}
   */
  static of(input: BinFormatInput): BinFormat {
    const outer = BinDimensions.of("extérieures", input.outer);
    const inner = BinDimensions.of("intérieures", input.inner);
    ensureInnerFits(inner, outer);
    if (
      !Number.isInteger(input.maxStack) ||
      input.maxStack < BIN_MAX_STACK_MIN ||
      input.maxStack > BIN_MAX_STACK_MAX
    ) {
      throw new InvalidBinMaxStackError(input.maxStack, BIN_MAX_STACK_MIN, BIN_MAX_STACK_MAX);
    }
    return new BinFormat(outer, inner, input.maxStack);
  }
}
