import type {
  OrderLineOptionChoice,
  RequestedOptionChoice,
} from "../../../domain/value-objects/order-line-options.js";
import { carriedOptionChoices } from "../../../revision/domain/services/carried-option-choices.js";

/** La ligne d'origine, réduite à ce que ses options regardent. */
export interface OriginOptionedLine {
  readonly sku: string;
  readonly saleUnit: "piece" | "weight";
  readonly optionChoices: readonly OrderLineOptionChoice[];
}

/**
 * **Les options d'une ligne de reliquat**, reprises de la ligne d'origine
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.4) — pur.
 *
 * Ce qui reste à livrer ne dit pas quelles pièces manquaient : les options
 * d'origine sont plafonnées à la quantité du reliquat par la règle du bon
 * de livraison et de la révision (`carriedOptionChoices`) — le « sans »
 * d'abord, puis les choix. 4 pains « dont 2 tranchés », 1 manquant : le
 * reliquat porte « dont 1 tranché ». Au poids, le choix suit la ligne
 * entière. Sans ligne d'origine ou sans option : `[]`.
 *
 * Rendues sous la forme d'une DEMANDE (groupe, choix, quantité) : la saisie
 * les rejuge contre le catalogue d'aujourd'hui, comme toute ligne.
 */
export function backorderOptionChoicesOf(
  origin: readonly OriginOptionedLine[],
  line: { readonly sku: string; readonly quantity: number },
): readonly RequestedOptionChoice[] {
  const source = origin.find((candidate) => candidate.sku === line.sku);
  if (source === undefined || source.optionChoices.length === 0) {
    return [];
  }
  return carriedOptionChoices(source, line.quantity).map((option) => ({
    group: option.group,
    choice: option.choice,
    quantity: option.quantity,
  }));
}
