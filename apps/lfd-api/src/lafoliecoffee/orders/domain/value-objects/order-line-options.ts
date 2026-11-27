import type { SaleUnit } from "@lfd/money";

import {
  DuplicateOptionChoiceError,
  OptionQuantityAboveLineError,
  OptionQuantityNotPositiveError,
  WeightOptionQuantityError,
} from "../errors/order-option-errors.js";

/**
 * **Une option figée d'une ligne** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.3) : le groupe
 * et le choix par leurs clés, leurs libellés tels qu'ils étaient à la
 * passation, et combien d'unités de la ligne les portent. Aucun montant : les
 * options sont gratuites (décision de Hugo du 2026-11-19).
 */
export interface OrderLineOptionChoice {
  readonly group: string;
  readonly groupName: string;
  readonly choice: string;
  readonly choiceLabel: string;
  /** Des pièces ; au poids, les grammes de toute la ligne. */
  readonly quantity: number;
  /** L'ordre d'affichage, celui du référentiel à la passation. */
  readonly position: number;
}

/** Ce que la demande dit d'une option : un groupe, un choix, une quantité. */
export interface RequestedOptionChoice {
  readonly group: string;
  readonly choice: string;
  readonly quantity: number;
}

/** Aucune option : ce qu'est toute ligne qui n'en demande pas. */
export const NO_OPTION_CHOICES: readonly OrderLineOptionChoice[] = [];

/** La ligne, réduite à ce que ses options regardent. */
export interface OptionedLine {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly quantity: number;
}

/**
 * **L'invariant des options d'une ligne**, tenu par la ligne elle-même
 * (`OrderLine.create`, `OrderLine.ofTtc`) — quel que soit le chemin qui
 * l'a composée :
 *
 * - une option se compte au moins une fois (« sans » est le reste, pas une
 *   option) ;
 * - un même choix ne figure qu'une fois ;
 * - au poids, un choix vaut pour toute la ligne : sa quantité est celle de
 *   la ligne (décidé par Hugo le 2026-11-19) ;
 * - la somme d'un groupe ne dépasse pas la quantité de la ligne. Chaque
 *   groupe se compte indépendamment (tranché + emballé).
 *
 * @throws {OptionQuantityNotPositiveError} une quantité nulle ou négative.
 * @throws {DuplicateOptionChoiceError} un choix cité deux fois.
 * @throws {WeightOptionQuantityError} au poids, une quantité autre que la ligne.
 * @throws {OptionQuantityAboveLineError} un groupe compte plus que la ligne.
 */
export function ensureLineOptions(
  line: OptionedLine,
  choices: readonly OrderLineOptionChoice[],
): readonly OrderLineOptionChoice[] {
  const seen = new Set<string>();
  const sums = new Map<string, { readonly name: string; readonly total: number }>();
  for (const option of choices) {
    if (!Number.isInteger(option.quantity) || option.quantity <= 0) {
      throw new OptionQuantityNotPositiveError(line.sku, option.choiceLabel, option.quantity);
    }
    const key = JSON.stringify([option.group, option.choice]);
    if (seen.has(key)) {
      throw new DuplicateOptionChoiceError(line.sku, option.group, option.choice);
    }
    seen.add(key);
    if (line.saleUnit === "weight" && option.quantity !== line.quantity) {
      throw new WeightOptionQuantityError(
        line.sku,
        option.choiceLabel,
        option.quantity,
        line.quantity,
      );
    }
    const total = (sums.get(option.group)?.total ?? 0) + option.quantity;
    if (total > line.quantity) {
      throw new OptionQuantityAboveLineError(line.sku, option.groupName, total, line.quantity);
    }
    sums.set(option.group, { name: option.groupName, total });
  }
  return choices.map((option) => ({ ...option }));
}
