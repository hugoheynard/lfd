import { InvalidStorefrontError } from "./storefront-errors.js";

/**
 * La forme d'une clé d'opération — minuscules, chiffres, tirets, sans tiret en
 * tête, en queue ni doublé. La MÊME que celle du référentiel
 * (`pim/operations/domain/value-objects/operation-key.ts`, vérifié le
 * 2026-09-24), recopiée et non importée : la vitrine ne lit pas le PIM
 * (CLAUDE.md §1), elle en garde l'identifiant.
 */
const KEY_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY_MAX = 64;

/** La chaîne a-t-elle la forme d'une clé d'opération ? */
export function isOperationKey(raw: string): boolean {
  return raw.length <= KEY_MAX && KEY_SHAPE.test(raw);
}

/** Le préfixe du rayon d'une opération datée en boutique (D8). */
export const OPERATION_SHELF_PREFIX = "op:";

/**
 * **L'opération qu'une annonce désigne** (D11 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Seule la FORME est refusée. Une clé que le miroir des opérations ne connaît
 * pas — pas encore reçue, ou retirée depuis — est acceptée : l'opération peut
 * arriver au prochain envoi, et une annonce qu'on refuserait d'enregistrer
 * bloquerait toute la vitrine pour un contenu. La lecture publique l'éteint
 * tant que l'opération n'est pas montrée, et l'éditeur le signale.
 */
export class LinkedOperationKey {
  private constructor(readonly value: string) {}

  /** @throws {InvalidStorefrontError} la forme n'est pas celle d'une clé d'opération. */
  static of(raw: string): LinkedOperationKey {
    if (!isOperationKey(raw)) {
      throw new InvalidStorefrontError(
        "operation",
        `« ${raw} » n'est pas une opération : choisissez-en une dans la liste des opérations reçues.`,
      );
    }
    return new LinkedOperationKey(raw);
  }

  /** Le rayon de la boutique où l'opération paraît : `op:<key>`. */
  get shelfKey(): string {
    return `${OPERATION_SHELF_PREFIX}${this.value}`;
  }
}
