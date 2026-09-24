import { InvalidOperationKeyError } from "../errors/operation-errors.js";

/** Minuscules, chiffres, tirets — pas de tiret en tête, en queue, ni doublé. */
const KEY_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Une clé plus longue est un nom déguisé. */
const MAX_LENGTH = 64;

/**
 * **La clé d'une opération** — `noel-2026`.
 *
 * C'est son identité, et pas seulement dans le référentiel : elle part dans le
 * fil vers le commerce, qui y accroche ses surcharges, et devient la clé de
 * rayon `op:<key>` de la boutique. D'où une forme stricte plutôt qu'une
 * liberté : elle doit pouvoir voyager dans une URL sans être encodée. La même
 * forme est tenue par un `CHECK` en base.
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
