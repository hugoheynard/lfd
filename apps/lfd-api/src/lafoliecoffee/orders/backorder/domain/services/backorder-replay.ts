import type { RevisedFrom } from "../../../revision/application/services/revised-line-pricing.js";
import {
  replayableDiscountsOf,
  type RevisableDiscount,
} from "../../../domain/services/basket-discount-replay.js";
import { OrderLine, type OrderLineSnapshot } from "../../../domain/value-objects/order-line.js";
import { BackorderOriginLineMissingError } from "../errors/backorder-errors.js";
import type { BackorderOriginReplay } from "../ports/backorder-replay.reader.js";
import type { BackorderLine } from "../value-objects/backorder-line.js";

/**
 * **Le prix d'origine d'un reliquat, en rejeu** (`documentation/commandes/reliquat/reliquat.md`, § 6.3,
 * décisions 5 et 11). Pur.
 *
 * - **Les lignes** : celles de la commande d'origine pour les articles du
 *   reliquat, ramenées à la quantité du reliquat. La saisie demande
 *   exactement ces quantités : `priceRevisedLines` les voit inchangées et
 *   garde leur prix unitaire figé — aucune retarification, aucun palier
 *   rejugé. Les totaux de ligne sont recalculés par `OrderLine.create` à la
 *   nouvelle quantité ; le chiffrage ne les lit pas, il recalcule tout dans
 *   `priceBasket`.
 * - **Les remises** : celles que la commande d'origine rejouerait, réduites
 *   à la règle du reste (`isRemainderDiscount`) — un pourcentage reste, un
 *   montant fixe a déjà servi sur l'origine et sort,
 *   comme une remise reprise sans ajustement. Le seuil (`min_quantity`) n'est
 *   pas jugé ici : sous la passation, un reste sous le seuil garde sa remise.
 *
 * @throws {BackorderOriginLineMissingError} un article du reliquat absent de l'origine.
 */
export function backorderReplayOf(
  origin: Pick<BackorderOriginReplay, "lines" | "replayable">,
  remainder: readonly BackorderLine[],
): RevisedFrom {
  return {
    lines: remainder.map((line) => replayedLineOf(origin.lines, line)),
    discounts: replayableDiscountsOf(origin.replayable).filter(isRemainderDiscount),
  };
}

/** Un pourcentage se recompose sur le reste ; un montant fixe, jamais. */
function isRemainderDiscount(discount: RevisableDiscount): boolean {
  return discount.adjustment?.mode === "percent";
}

function replayedLineOf(
  origin: readonly OrderLineSnapshot[],
  line: BackorderLine,
): OrderLineSnapshot {
  const source = origin.find((candidate) => candidate.sku === line.sku);
  if (source === undefined) {
    throw new BackorderOriginLineMissingError(line.sku);
  }
  // L'étiquette TTC n'est scellée que sur une commande de particulier : sa
  // présence dit la clientèle de la ligne d'origine.
  const clientele = source.unitPriceTtcCents === null ? "pro" : "public";
  return OrderLine.create({ ...source, quantity: line.quantity }, clientele).toSnapshot();
}
