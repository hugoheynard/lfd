import type { OfferedOptionGroup } from "../../../catalog/domain/option-groups/catalog-option-groups.js";
import {
  OptionChoiceNotOfferedError,
  OptionGroupNotOfferedError,
  OptionQuantityNotPositiveError,
  WeightOptionQuantityError,
} from "../errors/order-option-errors.js";
import {
  ensureLineOptions,
  type OptionedLine,
  type OrderLineOptionChoice,
  type RequestedOptionChoice,
} from "../value-objects/order-line-options.js";

/** Une ligne demandée, réduite à ce que ses options regardent. */
export interface RequestedOptionedLine {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit: "piece" | "weight";
  readonly optionChoices?: readonly RequestedOptionChoice[] | undefined;
}

/**
 * **Les options demandées d'un panier, fusionnées par SKU** comme ses
 * quantités (`OrderLinePricing`) : une commande ne porte qu'une ligne par
 * SKU, donc deux lignes du même pain « dont 1 tranché » font une ligne
 * « dont 2 tranchés ».
 *
 * Chaque ligne DEMANDÉE se juge d'abord seule, comme son unité : une
 * quantité nulle ou négative, ou au poids une quantité autre que celle de la
 * ligne, est refusée — jamais corrigée. Au poids, le choix vaut ensuite pour
 * toute la ligne fusionnée ({@link freezeOptionChoices}).
 *
 * Un SKU dont aucune ligne ne demande d'option est ABSENT de la table rendue.
 *
 * @throws {OptionQuantityNotPositiveError} une quantité nulle ou négative.
 * @throws {WeightOptionQuantityError} au poids, une quantité autre que la ligne.
 */
export function mergeRequestedOptions(
  lines: readonly RequestedOptionedLine[],
): ReadonlyMap<string, readonly RequestedOptionChoice[]> {
  const merged = new Map<string, Map<string, RequestedOptionChoice>>();
  for (const line of lines) {
    for (const option of line.optionChoices ?? []) {
      ensureRequestedOption(line, option);
      const bySku = merged.get(line.sku) ?? new Map<string, RequestedOptionChoice>();
      const key = JSON.stringify([option.group, option.choice]);
      const quantity = (bySku.get(key)?.quantity ?? 0) + option.quantity;
      bySku.set(key, { group: option.group, choice: option.choice, quantity });
      merged.set(line.sku, bySku);
    }
  }
  return new Map([...merged].map(([sku, options]) => [sku, [...options.values()]]));
}

function ensureRequestedOption(line: RequestedOptionedLine, option: RequestedOptionChoice): void {
  if (option.quantity <= 0) {
    throw new OptionQuantityNotPositiveError(line.sku, option.choice, option.quantity);
  }
  if (line.saleUnit === "weight" && option.quantity !== line.quantity) {
    throw new WeightOptionQuantityError(line.sku, option.choice, option.quantity, line.quantity);
  }
}

/** La ligne fusionnée dont on fige les options. */
export interface LineToOption extends OptionedLine {
  readonly productName: string;
}

/**
 * **Les options d'une ligne, figées contre ce que le catalogue propose au
 * client** (`plan-options-de-commande.md`, § 3.3).
 *
 * `offered` : les groupes que le catalogue propose sur ce SKU **à la
 * clientèle du client** — résolue par le serveur, celle du client même quand
 * l'équipe commande à sa place. Un groupe absent, ou un choix absent de son
 * groupe, est refusé par son nom.
 *
 * `kept` : les options déjà figées sur cette ligne (une révision). Un choix
 * qui y figure reste admis sous ses libellés d'alors, même si le catalogue ne
 * le propose plus — la ligne gardée garde ce qu'elle avait, comme son prix.
 *
 * Les libellés sont ceux du catalogue à cet instant ; l'ordre, celui du
 * référentiel. La somme d'un groupe se juge ici comme sur la ligne
 * (`ensureLineOptions`), pour qu'un devis refuse ce que la passation refuserait.
 *
 * @throws {OptionGroupNotOfferedError} le groupe n'est pas proposé sur l'article.
 * @throws {OptionChoiceNotOfferedError} le choix n'est pas proposé à cette clientèle.
 * @throws {OptionQuantityAboveLineError} un groupe compte plus que la ligne.
 */
export function freezeOptionChoices(
  line: LineToOption,
  requested: readonly RequestedOptionChoice[],
  offered: readonly OfferedOptionGroup[],
  kept: readonly OrderLineOptionChoice[] = [],
): readonly OrderLineOptionChoice[] {
  const frozen = requested.map((option) => {
    const quantity = line.saleUnit === "weight" ? line.quantity : option.quantity;
    const known = kept.find((k) => k.group === option.group && k.choice === option.choice);
    if (known !== undefined) {
      // Ses libellés d'alors ; son rang, celui du référentiel s'il le propose encore.
      const rank = offeredRank(offered, option);
      return { ...known, quantity, position: rank ?? NO_LONGER_OFFERED + known.position };
    }
    return { ...offeredChoice(line, option, offered), quantity };
  });
  return ensureLineOptions(
    line,
    [...frozen]
      .sort((a, b) => a.position - b.position)
      .map((option, position) => ({ ...option, position })),
  );
}

/** L'option demandée, nommée et rangée par le catalogue — ou refusée. */
function offeredChoice(
  line: LineToOption,
  option: RequestedOptionChoice,
  offered: readonly OfferedOptionGroup[],
): Omit<OrderLineOptionChoice, "quantity"> {
  const groupIndex = offered.findIndex((group) => group.id === option.group);
  const group = offered[groupIndex];
  if (group === undefined) {
    throw new OptionGroupNotOfferedError(line.sku, line.productName, option.group);
  }
  const choiceIndex = group.choices.findIndex((choice) => choice.key === option.choice);
  const choice = group.choices[choiceIndex];
  if (choice === undefined) {
    throw new OptionChoiceNotOfferedError(line.sku, line.productName, group.name, option.choice);
  }
  return {
    group: group.id,
    groupName: group.name,
    choice: choice.key,
    choiceLabel: choice.label,
    // Le rang du référentiel : groupe d'abord, puis choix. Renuméroté ensuite.
    position: groupIndex * POSITIONS_PER_GROUP + choiceIndex,
  };
}

/** Le rang d'un choix encore proposé, ou `null`. */
function offeredRank(
  offered: readonly OfferedOptionGroup[],
  option: RequestedOptionChoice,
): number | null {
  const groupIndex = offered.findIndex((group) => group.id === option.group);
  const choiceIndex =
    offered[groupIndex]?.choices.findIndex((choice) => choice.key === option.choice) ?? -1;
  return choiceIndex < 0 ? null : groupIndex * POSITIONS_PER_GROUP + choiceIndex;
}

/** Assez de place pour les choix d'un groupe avant le suivant. */
const POSITIONS_PER_GROUP = 1_000;

/** Un choix gardé que le catalogue ne propose plus se range après les autres. */
const NO_LONGER_OFFERED = 1_000_000;
