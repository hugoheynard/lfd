import type { CarrierNoteLine } from "@lfd/contracts";

/**
 * **La mention des options d'une ligne de bon** — « Tranchage : 2 × tranché »
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.4). Pur.
 *
 * Un groupe par segment, ses choix à la suite ; le compte s'écrit quand le
 * choix ne vaut pas pour toute la ligne. Au poids, ou quand toute la ligne
 * le porte, le choix se dit seul. Le libellé est celui du référentiel : son
 * pluriel ne se fabrique pas. `""` : aucune option.
 */
export function noteOptionMentionOf(line: CarrierNoteLine): string {
  const groups = new Map<string, string[]>();
  for (const option of line.options ?? []) {
    const whole = line.saleUnit === "weight" || option.quantity >= line.quantity;
    const said = whole ? option.choiceLabel : `${String(option.quantity)} × ${option.choiceLabel}`;
    groups.set(option.groupName, [...(groups.get(option.groupName) ?? []), said]);
  }
  return [...groups]
    .map(([groupName, choices]) => `${groupName} : ${choices.join(", ")}`)
    .join(" · ");
}

/** La hauteur ajoutée sous le nom d'une ligne qui porte une mention, en millimètres. */
export const OPTION_MENTION_HEIGHT_MM = 4;
