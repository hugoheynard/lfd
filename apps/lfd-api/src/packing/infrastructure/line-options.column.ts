import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type { SheetLineOption } from "../domain/entities/packing-sheet.snapshot.js";

/** La colonne `packing_line.options` ne tient pas sa forme. */
export class StoredPackingLineOptionsUnreadableError extends TechnicalError {
  constructor(sku: string) {
    super(
      "packing.line_options_unreadable",
      `Les options de l'article ${sku} sur la liste à coliser sont illisibles. La base a été modifiée ` +
        "hors du code : vérifiez la commande à l'écran avant de la mettre au bac, et prévenez l'équipe technique.",
    );
  }
}

/**
 * Lit `packing_line.options` (« dont 2 tranchés »). Refuse plutôt que de
 * rendre `[]` : relire « sans option » ferait mettre au sac un pain entier
 * qu'on a demandé tranché.
 *
 * @throws {StoredPackingLineOptionsUnreadableError} forme hors du contrat.
 */
export function packingLineOptionsOf(sku: string, value: unknown): readonly SheetLineOption[] {
  if (!Array.isArray(value)) {
    throw new StoredPackingLineOptionsUnreadableError(sku);
  }
  return value.map((item: unknown) => {
    const option = optionOf(item);
    if (option === null) {
      throw new StoredPackingLineOptionsUnreadableError(sku);
    }
    return option;
  });
}

function optionOf(item: unknown): SheetLineOption | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const groupName = "groupName" in item ? item.groupName : undefined;
  const choiceLabel = "choiceLabel" in item ? item.choiceLabel : undefined;
  const quantity = "quantity" in item ? item.quantity : undefined;
  return typeof groupName === "string" &&
    groupName !== "" &&
    typeof choiceLabel === "string" &&
    choiceLabel !== "" &&
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity > 0
    ? { groupName, choiceLabel, quantity }
    : null;
}

/** Les options, telles que la colonne les écrit ; `[]` sans option. */
export function packingLineOptionsColumnOf(options: readonly SheetLineOption[] | undefined) {
  // Des littéraux, pas l'interface : Prisma veut une valeur JSON, à clés libres.
  return (options ?? []).map((option) => ({
    groupName: option.groupName,
    choiceLabel: option.choiceLabel,
    quantity: option.quantity,
  }));
}
