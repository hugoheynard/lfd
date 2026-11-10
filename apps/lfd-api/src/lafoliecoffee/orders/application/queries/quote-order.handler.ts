import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderQuoteLineView, OrderQuotePayload, OrderQuoteView } from "@lfd/contracts";

import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import type { OrderParties } from "../services/order-parties.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { OrderQuoting } from "../services/order-quoting.service.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import type { ResolvedOrderLine } from "../services/order-line-pricing.service.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";

/**
 * **Ce que la commande coûterait**, demandé avant de la passer.
 *
 * Une **requête** et non une commande : elle ne mute rien, elle répond. Le
 * panier du staff l'appelle à chaque changement de contenu ou de client, parce
 * que le prix dépend des deux — la mercuriale du client, le palier atteint par
 * la quantité — et qu'aucun des deux ne se devine dans le navigateur.
 */
export class QuoteOrderQuery {
  constructor(
    readonly actorUserId: string,
    readonly payload: OrderQuotePayload,
    /**
     * L'appelant est-il le **staff** ?
     *
     * Le staff estime pour n'importe quel client — c'est son métier, et sa
     * surface est déjà murée. Un CLIENT, lui, doit être membre de la société
     * qu'il nomme : sans ce mur, n'importe qui sonderait la mercuriale d'un
     * concurrent en devinant son identifiant. Un devis rend un PRIX NÉGOCIÉ ; il
     * se mure exactement comme la commande qui l'appliquerait.
     */
    readonly asStaff: boolean,
  ) {}
}

@QueryHandler(QuoteOrderQuery)
export class QuoteOrderHandler implements IQueryHandler<QuoteOrderQuery, OrderQuoteView> {
  constructor(
    private readonly quoting: OrderQuoting,
    private readonly guard: OrderGuardReader,
    private readonly cutoffNotice: OrderCutoffNotice,
    private readonly shelf: ShelfCircuit,
  ) {}

  async execute(query: QuoteOrderQuery): Promise<OrderQuoteView> {
    const { companyId } = query.payload;
    if (!query.asStaff && companyId !== null) {
      // Le MÊME mur que la commande, et par la même fonction : deux règles
      // d'appartenance pour la même société finiraient par diverger, et c'est
      // du côté de la lecture que la fuite serait silencieuse.
      ensureOrderMember(await this.guard.roleOf(query.actorUserId, companyId), companyId);
    }

    const parties: OrderParties = {
      companyId,
      // L'estimation ne s'attribue à personne : elle ne crée rien. Le saisisseur
      // n'apparaît qu'au moment où une commande existe, et porte une trace.
      placedByUserId: query.actorUserId,
      placedByStaffId: query.asStaff ? query.actorUserId : null,
      // Derrière une route gardée, staff ou client : un compte reconnu (§ 13.7).
      buyerKind: REGISTERED_BUYER,
    };
    const quoted = await this.quoting.quote(
      parties,
      query.payload.lines.map((line) => ({
        sku: line.sku,
        productName: "",
        unitPriceMillicents: 0,
        vatRate: 0,
        quantity: line.quantity,
        // L'unité dite par la ligne, que la tarification valide contre l'article.
        ...(line.saleUnit === undefined ? {} : { saleUnit: line.saleUnit }),
        pricing: null,
      })),
    );

    const { requestedDeliveryDate } = query.payload;
    return {
      lines: quoted.lines.map(toQuoteLine),
      // Un SIGNAL, pas un refus : le devis répond toujours, la passation seule
      // refuse — mais par la même décision, pour qu'un devis ne promette plus
      // ce que la caisse refusera (point 8, 2026-10-21).
      // Séparé sur la marque, décidée comme à la passation (lot L4) : une
      // commande sur stock n'a pas d'heure limite.
      cutoff:
        requestedDeliveryDate === undefined
          ? null
          : await this.cutoffNotice.forDay(
              query.payload.lines.map((line) => line.sku),
              requestedDeliveryDate,
              (await this.shelf.decide(parties, requestedDeliveryDate, query.payload.supply))
                .supply,
            ),
      // Le sous-total de la composition même de la commande (`priceBasket`
      // puis `draftedAmountsOf`, lot L3) : arrondi au centime une fois par
      // ligne en `line_ht`, composé en TTC en `exact_ht`.
      subtotalCents: quoted.subtotalCents,
    };
  }
}

/**
 * La ligne résolue → sa vue.
 *
 * `canonicalMillicents` vient de la **trace**, pas d'une seconde lecture du
 * catalogue : c'est le tarif d'entrée que la résolution a réellement utilisé, et
 * le relire ailleurs pourrait donner un autre nombre entre-temps. Sans trace —
 * une ligne qu'aucune règle n'a touchée — le prix final EST le tarif d'entrée.
 */
function toQuoteLine(resolved: ResolvedOrderLine): OrderQuoteLineView {
  const { line } = resolved;
  const trace = line.pricing ?? null;
  return {
    sku: line.sku,
    productName: line.productName,
    canonicalMillicents: trace?.basePriceMillicents ?? line.unitPriceMillicents,
    unitPriceMillicents: line.unitPriceMillicents,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    vatRate: line.vatRate,
    steps: trace?.steps ?? [],
    floored: trace?.floored ?? false,
    sealedByRuleId: resolved.sealedByRuleId,
    sealedRuleIds: resolved.sealedRuleIds,
    volumeTiers: resolved.volumeTiers,
    floorMillicents: resolved.floorMillicents,
  };
}
