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

/**
 * **Les SKU qu'une modification de l'équipe soumet à leur limite d'article.**
 *
 * À journée inchangée : les lignes ajoutées ou augmentées ({@link raisedSkus})
 * — les autres ont été jugées pour cette journée à leur passation. Quand la
 * journée CHANGE : toutes les lignes, car aucune n'a été jugée pour la
 * nouvelle (Hugo, 2026-11-19 : une même case et un même droit donnent la même
 * réponse partout — déplacer une commande ne fait pas passer en douce un
 * produit dont la limite tombe avant la nouvelle date).
 */
export function staffJudgedSkus(
  before: { readonly serviceDay: string | null; readonly lines: readonly CountedLine[] },
  after: { readonly serviceDay: string | null; readonly lines: readonly CountedLine[] },
): readonly string[] {
  if (before.serviceDay === after.serviceDay) {
    return raisedSkus(before.lines, after.lines);
  }
  return [...totalsBySku(after.lines).keys()];
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
 * **Une ligne soumise que sa propre limite ferme** : la limite, et si la
 * modification la fera passer (`exceedable` : le verdict la dit dépassée —
 * la case du produit, le droit, une limite générale ce jour-là qui ne ferme
 * pas). Faux : la modification sera refusée tant qu'elle la garde.
 */
export interface ClosedItemLimit extends ExceededItemLimit {
  readonly exceedable: boolean;
}

/**
 * **Ce que la limite d'article dit des lignes que l'équipe soumet** (ajoutées,
 * augmentées, ou toutes quand la journée change) — la règle générale ne lui
 * est pas opposée, la limite d'article l'est. Le devis les annonce ; la
 * modification refuse ({@link admitStaffItemLimits}).
 */
export interface StaffItemLimits {
  /** Les limites dépassées, à justifier par un motif et à consigner. */
  readonly exceeded: readonly ExceededItemLimit[];
  /** Les lignes que leur limite ferme, dépassables ou non, dans l'ordre du panier. */
  readonly closed: readonly ClosedItemLimit[];
}

/** Rien de soumis : le client, une commande sur stock, aucune ligne jugée. */
export const NO_STAFF_ITEM_LIMITS: StaffItemLimits = { exceeded: [], closed: [] };

/**
 * Lu sur le verdict des seuls SKU soumis ({@link staffJudgedSkus}), sans
 * rien recalculer.
 */
export function staffItemLimitsOf(verdict: OrderDeadlineVerdict): StaffItemLimits {
  const closed = [...verdict.lines].flatMap(([sku, line]): ClosedItemLimit[] =>
    line.itemStatus === "closed" && line.itemLimit !== null
      ? [{ sku, ...line.itemLimit, exceedable: line.exceeded }]
      : [],
  );
  return { exceeded: verdict.exceeded, closed };
}

/**
 * **La modification de l'équipe admet-elle ses lignes soumises ?** Une ligne
 * que sa propre limite ferme passe seulement si elle est dépassable ; rend
 * alors les dépassements, à justifier et à consigner.
 *
 * `lines` : la composition chiffrée, pour nommer le produit d'un refus.
 *
 * @throws {ItemLimitPassedOnRevisionError} une ligne soumise que sa limite ferme, non dépassable.
 */
export function admitStaffItemLimits(
  limits: StaffItemLimits,
  lines: readonly NamedLine[],
): readonly ExceededItemLimit[] {
  const refused = limits.closed.filter((closed) => !closed.exceedable);
  if (refused.length > 0) {
    throw new ItemLimitPassedOnRevisionError(
      refused.map(({ sku }) => lines.find((line) => line.sku === sku)?.productName ?? sku),
    );
  }
  return limits.exceeded;
}
