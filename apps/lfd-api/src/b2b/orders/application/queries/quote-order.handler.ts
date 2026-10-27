import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderQuoteLineView, OrderQuotePayload, OrderQuoteView } from "@lfd/contracts";

import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import type { ResolvedOrderLine } from "../services/order-line-pricing.service.js";
import { lineTotalCents } from "@lfd/money";

import { composeExactOrder } from "../../domain/services/exact-order-composition.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";

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
    private readonly drafting: OrderDrafting,
    private readonly guard: OrderGuardReader,
    private readonly cutoffNotice: OrderCutoffNotice,
  ) {}

  async execute(query: QuoteOrderQuery): Promise<OrderQuoteView> {
    const { companyId } = query.payload;
    if (!query.asStaff && companyId !== null) {
      // Le MÊME mur que la commande, et par la même fonction : deux règles
      // d'appartenance pour la même société finiraient par diverger, et c'est
      // du côté de la lecture que la fuite serait silencieuse.
      ensureOrderMember(await this.guard.roleOf(query.actorUserId, companyId), companyId);
    }

    const lines = await this.drafting.quote(
      {
        companyId,
        // L'estimation ne s'attribue à personne : elle ne crée rien. Le saisisseur
        // n'apparaît qu'au moment où une commande existe, et porte une trace.
        placedByUserId: query.actorUserId,
        placedByStaffId: query.asStaff ? query.actorUserId : null,
      },
      query.payload.lines.map((line) => ({
        sku: line.sku,
        productName: "",
        unitPriceMillicents: 0,
        vatRate: 0,
        quantity: line.quantity,
        pricing: null,
      })),
    );

    const { requestedDeliveryDate } = query.payload;
    return {
      lines: lines.map(toQuoteLine),
      // Un SIGNAL, pas un refus : le devis répond toujours, la passation seule
      // refuse — mais par la même décision, pour qu'un devis ne promette plus
      // ce que la caisse refusera (point 8, 2026-10-21).
      cutoff:
        requestedDeliveryDate === undefined
          ? null
          : await this.cutoffNotice.forDay(
              query.payload.lines.map((line) => line.sku),
              requestedDeliveryDate,
            ),
      // Le sous-total est un MONTANT : il s'arrondit au centime, une fois par
      // ligne, exactement comme la commande le fera. Sommer des millicentimes
      // rendrait un devis mille fois trop cher — et un devis qui ne prédit pas
      // la facture ne sert à rien.
      subtotalCents: subtotalOf(
        companyId,
        lines.map(({ line }) => line),
      ),
    };
  }
}

/**
 * Le sous-total HT, par la méthode de la commande que ce devis annonce (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 6) : pour une
 * société, la somme des HT de ligne arrondis ; pour un particulier
 * (`exact_ht`), la somme des HT que la composition TTC rend, sans remise ni
 * port — que ce devis ne connaît pas. ⚠️ Pour un particulier, ce HT peut
 * encore bouger d'un centime à la passation : la TVA du taux se répartit
 * aussi sur la remise et le port.
 */
function subtotalOf(
  companyId: string | null,
  lines: readonly {
    readonly unitPriceMillicents: number;
    readonly quantity: number;
    readonly vatRate: number;
  }[],
): number {
  if (placementVatMethodOf(companyId) === "exact_ht") {
    const composed = composeExactOrder({
      lines,
      discountAdjustment: null,
      deliveryFeeAdjustment: null,
      deliveryVatMode: null,
      voucherFaceCents: 0,
    });
    return composed.lines.reduce((sum, line) => sum + line.htCents, 0);
  }
  return lines.reduce(
    (sum, line) => sum + lineTotalCents(line.unitPriceMillicents, line.quantity),
    0,
  );
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
    vatRate: line.vatRate,
    steps: trace?.steps ?? [],
    floored: trace?.floored ?? false,
    sealedByRuleId: resolved.sealedByRuleId,
    sealedRuleIds: resolved.sealedRuleIds,
    volumeTiers: resolved.volumeTiers,
    floorMillicents: resolved.floorMillicents,
  };
}
