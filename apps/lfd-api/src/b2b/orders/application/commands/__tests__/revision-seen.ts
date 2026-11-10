import type { RevisionActor } from "../../../domain/entities/order-revision.js";
import { QuoteOrderRevisionHandler } from "../../queries/quote-order-revision.handler.js";
import { QuoteOrderRevisionQuery } from "../../queries/quote-order-revision.query.js";
import type { OrderContent } from "../../services/order-content.js";
import type { OrderRevising } from "../../services/order-revising.service.js";
import type { RevisionWall } from "../../services/revision-wall.js";
import { ReviseOrderCommand } from "../revise-order.command.js";

/** Bâtit la modification qu'un écran enverrait après avoir lu son devis. */
export type SeenRevision = (
  orderId: string,
  actor: RevisionActor,
  expectedRevision: number,
  content: OrderContent,
) => Promise<ReviseOrderCommand>;

/**
 * **La modification telle qu'un écran l'envoie** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R14) : le
 * devis d'abord, par le VRAI handler de devis sur la même scène, puis la
 * modification qui porte SON total. Un test n'invente donc jamais le total vu.
 *
 * Le devis refuse comme la modification avant la composition : un cas de
 * refus qui tombe avant le total vu construit sa commande à la main.
 */
export function seenRevisions(wall: RevisionWall, revising: OrderRevising): SeenRevision {
  const quotes = new QuoteOrderRevisionHandler(wall, revising);
  return async (orderId, actor, expectedRevision, content) => {
    const quote = await quotes.execute(new QuoteOrderRevisionQuery(orderId, actor, content));
    return new ReviseOrderCommand(orderId, actor, expectedRevision, content, quote.totalCents);
  };
}

/**
 * La modification d'un cas refusé AVANT le total vu (le mur, le règlement, la
 * règle, la composition — R15 du plan S2) : le devis refuserait de même, il
 * n'y a donc aucun total à lire. Celui porté ici n'est jamais comparé ; si un
 * jour il l'était, le test rougirait sur `OrderTotalChangedError` — l'ordre
 * des refus aurait changé.
 */
export const refusedEarly: SeenRevision = (orderId, actor, expectedRevision, content) =>
  Promise.resolve(new ReviseOrderCommand(orderId, actor, expectedRevision, content, 0));
