import type { ExceededItemLimit, OrderDeadlineVerdict } from "../../../../order-cutoffs/index.js";
import { ItemLimitPassedOnRevisionError } from "../../../domain/errors/item-limit-override-errors.js";
import type {
  ItemLimitOverride,
  NamedLine,
} from "../../../domain/services/item-limit-overrides.js";

/** Une ligne réduite à ce que la comparaison lit. */
export interface CountedLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Les SKU qu'une modification AJOUTE ou AUGMENTE** : absents avant, ou dont
 * la quantité totale (toutes lignes du même SKU) monte. Ce sont les seuls que
 * la limite d'article oppose à une modification de l'équipe : une ligne déjà
 * commandée, gardée ou réduite, a été jugée à sa passation.
 */
export function raisedSkus(
  before: readonly CountedLine[],
  after: readonly CountedLine[],
): readonly string[] {
  const previous = totalsBySku(before);
  return [...totalsBySku(after)].flatMap(([sku, quantity]) =>
    quantity > (previous.get(sku) ?? 0) ? [sku] : [],
  );
}

function totalsBySku(lines: readonly CountedLine[]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.sku, (totals.get(line.sku) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * **Les SKU dont un jugement du client écarte la limite d'article, pour une journée** : ceux dont un
 * dépassement est consigné sur cette commande POUR cette journée — leur
 * limite est passée par décision de l'équipe, et la juger fermerait toute la
 * commande. Une ligne dépassée que le client augmente n'est pas écartée :
 * une augmentation se juge comme un ajout.
 *
 * Par journée, et non par commande : la ligne déplacée à une autre journée
 * n'a été dépassée pour aucune, et redevient jugée.
 */
export function settledSkusOn(
  day: string,
  consigned: readonly ItemLimitOverride[],
  raised: readonly string[],
): ReadonlySet<string> {
  const increased = new Set(raised);
  return new Set(
    consigned
      .filter((override) => override.serviceDay === day && !increased.has(override.sku))
      .map((override) => override.sku),
  );
}

/**
 * **Ce que la limite d'article dit des lignes ajoutées par l'équipe** — la
 * règle générale ne lui est pas opposée, la limite d'article l'est. Une ligne
 * que sa propre limite ferme passe seulement si le verdict la dit dépassée
 * (la case du produit, le droit, une limite générale ce jour-là) ; elle rend
 * alors le dépassement, à justifier et à consigner.
 *
 * `verdict` est celui des SEULS SKU ajoutés ou augmentés.
 *
 * @throws {ItemLimitPassedOnRevisionError} une ligne ajoutée que sa limite ferme, non dépassée.
 */
export function admitRaisedLines(
  verdict: OrderDeadlineVerdict,
  lines: readonly NamedLine[],
): readonly ExceededItemLimit[] {
  const passed = [...verdict.lines].filter(
    ([, line]) => line.itemStatus === "closed" && !line.exceeded,
  );
  if (passed.length > 0) {
    throw new ItemLimitPassedOnRevisionError(
      passed.map(([sku]) => lines.find((line) => line.sku === sku)?.productName ?? sku),
    );
  }
  return verdict.exceeded;
}
