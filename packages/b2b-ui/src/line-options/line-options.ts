import type { OfferedOptionGroupView, OrderSaleUnit } from '@lfd/contracts';

/**
 * **Une option choisie sur une ligne du panier** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.3) — la forme
 * même de `OrderLineInput.optionChoices`, sans prix : les options sont
 * gratuites.
 */
export interface LineOptionChoice {
  readonly group: string;
  readonly choice: string;
  /** Des pièces ; au poids, toute la ligne (ses grammes). */
  readonly quantity: number;
}

/** Combien d'unités de la ligne portent ce choix — zéro s'il n'est pas choisi. */
export function choiceQuantityOf(
  choices: readonly LineOptionChoice[],
  group: string,
  choice: string,
): number {
  return choices.find((c) => c.group === group && c.choice === choice)?.quantity ?? 0;
}

/**
 * Le plus que ce choix peut porter : la ligne moins les autres choix du même
 * groupe. Le reste de la ligne est « sans » ; un groupe ne compte jamais plus
 * que la ligne (le serveur le refuse).
 */
export function choiceCeilingOf(
  choices: readonly LineOptionChoice[],
  group: string,
  choice: string,
  lineQuantity: number,
): number {
  const others = choices
    .filter((c) => c.group === group && c.choice !== choice)
    .reduce((sum, c) => sum + c.quantity, 0);
  return Math.max(0, lineQuantity - others);
}

/**
 * Pose la quantité d'un choix, bornée. À la pièce, entre zéro et ce que le
 * groupe laisse ; au poids, le choix vaut pour TOUTE la ligne et chasse les
 * autres choix de son groupe (une ligne au poids ne se partage pas). Zéro le
 * retire : une option à zéro n'existe pas.
 */
export function withChoiceQuantity(
  choices: readonly LineOptionChoice[],
  target: { readonly group: string; readonly choice: string },
  quantity: number,
  line: { readonly quantity: number; readonly saleUnit?: OrderSaleUnit | undefined },
): readonly LineOptionChoice[] {
  const byWeight = line.saleUnit === 'weight';
  const kept = choices.filter((c) =>
    byWeight ? c.group !== target.group : !(c.group === target.group && c.choice === target.choice),
  );
  const settled = byWeight
    ? quantity > 0
      ? line.quantity
      : 0
    : Math.min(
        Math.max(0, Math.floor(quantity)),
        choiceCeilingOf(choices, target.group, target.choice, line.quantity),
      );
  return settled > 0 ? [...kept, { ...target, quantity: settled }] : kept;
}

/**
 * Les options d'une ligne dont la quantité vient de changer. Au poids, chaque
 * choix suit la ligne entière. À la pièce, diminuer la ligne réduit d'abord le
 * « sans », puis les choix de chaque groupe en partant du dernier — la règle
 * de la révision (§ 3.3). Ce qui tombe à zéro disparaît.
 */
export function settleLineOptions(
  choices: readonly LineOptionChoice[],
  line: { readonly quantity: number; readonly saleUnit?: OrderSaleUnit | undefined },
): readonly LineOptionChoice[] {
  if (line.saleUnit === 'weight') {
    return choices.map((c) => ({ ...c, quantity: line.quantity }));
  }
  const used = new Map<string, number>();
  const settled: LineOptionChoice[] = [];
  for (const c of choices) {
    const room = Math.max(0, line.quantity - (used.get(c.group) ?? 0));
    const quantity = Math.min(c.quantity, room);
    if (quantity > 0) {
      used.set(c.group, (used.get(c.group) ?? 0) + quantity);
      settled.push({ ...c, quantity });
    }
  }
  return settled;
}

/**
 * Ne garde que les choix encore proposés sur l'article : un groupe ou un
 * choix retiré (ou réservé à une autre clientèle) ne part pas — le serveur
 * refuserait toute la ligne pour lui.
 */
export function offeredChoicesOnly(
  choices: readonly LineOptionChoice[],
  groups: readonly OfferedOptionGroupView[],
): readonly LineOptionChoice[] {
  return choices.filter((c) =>
    groups.some((g) => g.id === c.group && g.choices.some((k) => k.key === c.choice)),
  );
}

/**
 * Le champ `optionChoices` d'une ligne demandée : absent quand il n'y a rien,
 * pour qu'une ligne sans option garde exactement la forme d'avant (son
 * empreinte d'idempotence n'en dépend pas).
 */
export function optionChoicesField(choices: readonly LineOptionChoice[] | undefined): {
  readonly optionChoices?: LineOptionChoice[];
} {
  return choices === undefined || choices.length === 0
    ? {}
    : {
        optionChoices: choices.map((c) => ({
          group: c.group,
          choice: c.choice,
          quantity: c.quantity,
        })),
      };
}

/** Les mots d'une mention, dans la langue de l'écran. `{n}` et `{label}` y sont remplacés. */
export interface LineOptionWords {
  /** Une partie de la ligne porte le choix : « dont {n} {label} ». */
  readonly some: string;
}

/**
 * **La mention d'une ligne figée** — « dont 2 tranché », ou le libellé seul
 * quand le choix vaut pour toute la ligne (au poids, ou toutes les pièces).
 * Une mention par choix, dans l'ordre de la ligne.
 */
export function lineOptionMentions(
  line: {
    readonly quantity: number;
    readonly saleUnit?: OrderSaleUnit | undefined;
    readonly optionChoices?:
      readonly { readonly choiceLabel: string; readonly quantity: number }[] | undefined;
  },
  words: LineOptionWords = FRENCH_OPTION_WORDS,
): readonly string[] {
  return (line.optionChoices ?? []).map((c) =>
    line.saleUnit === 'weight' || c.quantity >= line.quantity
      ? c.choiceLabel
      : words.some.replace('{n}', String(c.quantity)).replace('{label}', c.choiceLabel),
  );
}

/** Les mots du back-office, qui ne parle que français. */
export const FRENCH_OPTION_WORDS: LineOptionWords = { some: 'dont {n} {label}' };
