import type { ProductionLineOption } from "../../../../production/channels/commerce/index.js";
import type { OrderLineOptionChoice } from "../value-objects/order-line-options.js";

/**
 * **Les options d'une ligne, telles que les ateliers les reçoivent**
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.4) : le nom du
 * groupe, le libellé du choix et la quantité, dans l'ordre du référentiel.
 * Les clés restent au commerce : le fournil et le colisage affichent, ils ne
 * rejugent rien. Pur.
 */
export function productionOptionsOf(
  choices: readonly OrderLineOptionChoice[],
): readonly ProductionLineOption[] {
  return [...choices]
    .sort((a, b) => a.position - b.position)
    .map((choice) => ({
      groupName: choice.groupName,
      choiceLabel: choice.choiceLabel,
      quantity: choice.quantity,
    }));
}
