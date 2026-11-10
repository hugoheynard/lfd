import { InvalidOperationKeyError } from "../errors/operation-errors.js";

/** Minuscules, chiffres, tirets — pas de tiret en tête, en queue, ni doublé. */
const KEY_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Une clé plus longue est un nom déguisé. */
const MAX_LENGTH = 64;

/**
 * **La clé d'une opération** — `noel-2026`.
 *
 * C'est son identité au commerce : la clé de rayon `op:<key>` de la boutique,
 * la cible d'une annonce de vitrine (`operation-link.ts`), et la même que celle
 * que le référentiel lui avait donnée — la bascule (lot 3 du plan) copie ses
 * opérations sous leur clé. D'où une forme stricte : elle doit pouvoir voyager
 * dans une URL sans être encodée. Reprise telle quelle de `pim/operations`.
 */
export class OperationKey {
  private constructor(readonly value: string) {}

  /** @throws {InvalidOperationKeyError} la forme n'est pas celle d'une clé. */
  static of(raw: string): OperationKey {
    const key = raw.trim();
    if (key.length > MAX_LENGTH || !KEY_SHAPE.test(key)) {
      throw new InvalidOperationKeyError(raw);
    }
    return new OperationKey(key);
  }
}
