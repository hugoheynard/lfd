import type { OrderLineOptionChoice } from "../../../domain/value-objects/order-line-options.js";

/** La ligne d'avant, réduite à ce que ses options regardent. */
export interface PreviousOptionedLine {
  readonly saleUnit: "piece" | "weight";
  readonly optionChoices: readonly OrderLineOptionChoice[];
}

/**
 * **Les options gardées d'une ligne dont la quantité change** sans que la
 * révision en redise (`documentation/catalogue/plan-options-de-commande.md`,
 * § 3.3). Pur.
 *
 * - Au poids, un choix vaut pour toute la ligne : il suit la nouvelle
 *   quantité.
 * - À la pièce, diminuer la quantité réduit **d'abord le « sans »**, puis les
 *   options, groupe par groupe : un groupe qui compte plus que la nouvelle
 *   quantité perd des unités en commençant par son dernier choix ; un choix
 *   tombé à zéro disparaît. Augmenter ne touche pas les options : le surplus
 *   est « sans ».
 */
export function carriedOptionChoices(
  line: PreviousOptionedLine,
  quantity: number,
): readonly OrderLineOptionChoice[] {
  if (line.saleUnit === "weight") {
    return line.optionChoices.map((option) => ({ ...option, quantity }));
  }
  const totals = new Map<string, number>();
  for (const option of line.optionChoices) {
    totals.set(option.group, (totals.get(option.group) ?? 0) + option.quantity);
  }
  const excess = new Map(
    [...totals].map(([group, total]) => [group, Math.max(0, total - quantity)]),
  );
  const trimmed = [...line.optionChoices]
    .sort((a, b) => b.position - a.position)
    .map((option) => {
      const left = excess.get(option.group) ?? 0;
      const removed = Math.min(left, option.quantity);
      excess.set(option.group, left - removed);
      return { ...option, quantity: option.quantity - removed };
    });
  return trimmed.filter((option) => option.quantity > 0).sort((a, b) => a.position - b.position);
}
