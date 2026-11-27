import type { SaleUnit } from "@lfd/money";

/** Une option telle que la ligne figée la porte : le groupe, le choix, combien. */
interface MentionedOption {
  readonly groupName: string;
  readonly choiceLabel: string;
  readonly quantity: number;
}

/**
 * **La mention des options d'une ligne, sur un papier du fournil** —
 * « Tranchage : 2 × tranché » (`documentation/catalogue/plan-options-de-commande.md`,
 * § 3.4). Pur.
 *
 * Un groupe par segment, ses choix à la suite. Le compte s'écrit devant le
 * choix quand il ne vaut pas pour toute la ligne ; au poids, ou quand toute
 * la ligne le porte, le choix se dit seul (« Tranchage : tranché »). Le
 * libellé est celui du référentiel, tel quel : son pluriel ne se fabrique
 * pas. `""` : aucune option.
 */
export function optionMentionOf(
  line: { readonly quantity: number; readonly saleUnit: SaleUnit },
  options: readonly MentionedOption[],
): string {
  const groups = new Map<string, string[]>();
  for (const option of options) {
    const whole = line.saleUnit === "weight" || option.quantity >= line.quantity;
    const said = whole ? option.choiceLabel : `${String(option.quantity)} × ${option.choiceLabel}`;
    groups.set(option.groupName, [...(groups.get(option.groupName) ?? []), said]);
  }
  return [...groups]
    .map(([groupName, choices]) => `${groupName} : ${choices.join(", ")}`)
    .join(" · ");
}
