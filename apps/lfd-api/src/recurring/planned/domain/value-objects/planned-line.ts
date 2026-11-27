import {
  DuplicatePlannedLineError,
  InvalidPlannedLineError,
} from "../errors/planned-column-errors.js";

/**
 * Une ligne d'un jour planifié : une référence catalogue (opaque) et une
 * quantité. Le prix n'y est pas : la colonne se chiffre par le devis de la
 * boutique, et se facture au prix du jour de la conversion.
 */
export class PlannedLine {
  private constructor(
    readonly sku: string,
    readonly quantity: number,
  ) {}

  /** @throws {InvalidPlannedLineError} SKU vide, quantité qui n'est pas un entier positif. */
  static create(sku: string, quantity: number): PlannedLine {
    const trimmed = sku.trim();
    if (trimmed === "") {
      throw new InvalidPlannedLineError(sku, "SKU vide");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidPlannedLineError(trimmed, "quantité entière strictement positive attendue");
    }
    return new PlannedLine(trimmed, quantity);
  }

  /**
   * Les lignes d'une colonne, chacune un article différent.
   *
   * @throws {DuplicatePlannedLineError} un article y figure deux fois.
   */
  static column(lines: readonly PlannedLine[]): readonly PlannedLine[] {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.sku)) {
        throw new DuplicatePlannedLineError(line.sku);
      }
      seen.add(line.sku);
    }
    return [...lines];
  }

  equals(other: PlannedLine): boolean {
    return this.sku === other.sku && this.quantity === other.quantity;
  }
}
