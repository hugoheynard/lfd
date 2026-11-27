import { carriedOptionChoices } from "../../../orders/revision/domain/services/carried-option-choices.js";
import type {
  DeliveryNoteLineOption,
  DeliveryNoteSourceLine,
} from "../value-objects/delivery-note-line.js";

/**
 * **Les options d'une ligne qui part en partie** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.4) — pur.
 *
 * Plafonnées à la quantité qui part par la règle même de la révision
 * (`carriedOptionChoices`) : le « sans » se retire d'abord, puis les choix,
 * en commençant par le dernier ; un groupe ne compte jamais plus que ce qui
 * part. Si 2 pains partent sur 4 « dont 2 tranchés », le bon dit au plus
 * « dont 2 tranchés ». Au poids, le choix suit la ligne entière. Une ligne
 * qui ne part pas n'en garde aucune.
 */
export function departingOptionChoices(
  line: DeliveryNoteSourceLine,
  quantity: number,
): readonly DeliveryNoteLineOption[] {
  const options = line.optionChoices ?? [];
  if (options.length === 0 || quantity === line.quantity) {
    return options;
  }
  return quantity === 0
    ? []
    : carriedOptionChoices({ saleUnit: line.saleUnit, optionChoices: options }, quantity);
}

/** Les mêmes options, dans le même ordre : clés et quantités. */
export function sameOptionChoices(
  a: readonly DeliveryNoteLineOption[],
  b: readonly DeliveryNoteLineOption[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (option, i) =>
        option.group === b[i]?.group &&
        option.choice === b[i]?.choice &&
        option.quantity === b[i]?.quantity,
    )
  );
}
