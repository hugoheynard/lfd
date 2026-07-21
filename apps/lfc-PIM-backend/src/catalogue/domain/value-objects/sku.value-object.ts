import { InvalidSkuError } from '../errors/sku-errors.js';

/**
 * Référence d'un article — ce qu'un **humain** lit et dit (`PATI-TARTE-FRAISE-6P`).
 *
 * Le charset `A-Z 0-9 -` n'est pas esthétique : c'est l'intersection sûre de tout ce que
 * la référence traverse (champ Shopify, écran de caisse, export CSV, étiquette, URL).
 *
 * Invariants (cf. `documentation/lfc/data-model/06-identifiants-et-sku.md`) :
 * - `create()` est le **seul** constructeur → un SKU invalide ne peut pas exister en mémoire ;
 * - la valeur est **toujours normalisée** (majuscules) → un index unique ordinaire suffit
 *   à garantir l'unicité insensible à la casse ;
 * - **rien ne parse jamais un SKU** : c'est un libellé, pas une structure de données.
 */
export const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
export const SKU_MIN_LENGTH = 3;
export const SKU_MAX_LENGTH = 32;

export class Sku {
  private constructor(readonly value: string) {}

  static create(raw: string): Sku {
    const normalized = Sku.normalize(raw);

    if (normalized.length < SKU_MIN_LENGTH) {
      throw new InvalidSkuError(raw, `au moins ${SKU_MIN_LENGTH} caractères`);
    }
    if (normalized.length > SKU_MAX_LENGTH) {
      throw new InvalidSkuError(raw, `au plus ${SKU_MAX_LENGTH} caractères`);
    }
    if (!SKU_PATTERN.test(normalized)) {
      throw new InvalidSkuError(raw, 'lettres, chiffres et tirets uniquement');
    }

    return new Sku(normalized);
  }

  /**
   * Met la chaîne sous forme canonique. **Idempotente** :
   * `normalize(normalize(x)) === normalize(x)`.
   */
  static normalize(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '') // diacritiques : « crème » → « creme »
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, '-') // tout séparateur devient un tiret unique
      .replace(/^-+|-+$/gu, '');
  }

  equals(other: Sku): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
