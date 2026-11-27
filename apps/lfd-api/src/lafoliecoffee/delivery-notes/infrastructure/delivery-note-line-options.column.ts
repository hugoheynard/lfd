import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { DeliveryNoteLineOption } from "../domain/value-objects/delivery-note-line.js";

/** La colonne `delivery_note_line.options` ne tient pas sa forme. */
export class StoredDeliveryNoteLineOptionsUnreadableError extends TechnicalError {
  constructor(sku: string) {
    super(
      "delivery_note.line_options_unreadable",
      `Les options de l'article ${sku} sur un bon de livraison sont illisibles. La base a été ` +
        "modifiée hors du code : n'imprimez pas ce bon, vérifiez la commande à l'écran et prévenez l'équipe technique.",
    );
  }
}

/**
 * Lit `delivery_note_line.options` (« dont 2 tranchés »). Refuse plutôt que
 * de rendre `[]` : un bon « sans option » ferait livrer entier un pain
 * demandé tranché.
 *
 * @throws {StoredDeliveryNoteLineOptionsUnreadableError} forme hors du contrat.
 */
export function deliveryNoteLineOptionsOf(
  sku: string,
  value: unknown,
): readonly DeliveryNoteLineOption[] {
  if (!Array.isArray(value)) {
    throw new StoredDeliveryNoteLineOptionsUnreadableError(sku);
  }
  return value.map((item: unknown) => {
    const option = optionOf(item);
    if (option === null) {
      throw new StoredDeliveryNoteLineOptionsUnreadableError(sku);
    }
    return option;
  });
}

function optionOf(item: unknown): DeliveryNoteLineOption | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const group = textOf("group" in item ? item.group : undefined);
  const groupName = textOf("groupName" in item ? item.groupName : undefined);
  const choice = textOf("choice" in item ? item.choice : undefined);
  const choiceLabel = textOf("choiceLabel" in item ? item.choiceLabel : undefined);
  const quantity = "quantity" in item ? item.quantity : undefined;
  const position = "position" in item ? item.position : undefined;
  if (
    group === null ||
    groupName === null ||
    choice === null ||
    choiceLabel === null ||
    !isPositiveInteger(quantity) ||
    typeof position !== "number" ||
    !Number.isInteger(position)
  ) {
    return null;
  }
  return { group, groupName, choice, choiceLabel, quantity, position };
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Les options, telles que la colonne les écrit ; `[]` sans option. */
export function deliveryNoteLineOptionsColumnOf(
  options: readonly DeliveryNoteLineOption[] | undefined,
) {
  // Des littéraux, pas l'interface : Prisma veut une valeur JSON, à clés libres.
  return (options ?? []).map((option) => ({
    group: option.group,
    groupName: option.groupName,
    choice: option.choice,
    choiceLabel: option.choiceLabel,
    quantity: option.quantity,
    position: option.position,
  }));
}
