import type { AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ParticularStandingReader } from "../../../../account/domain/ports/particular-standing.reader.js";
import { withCatalogueSnapshot } from "../../../../catalog/application/catalogue-snapshot-scope.js";
import { prepareCounterParticularOrder } from "../../../application/services/counter-particular-order-preparation.js";
import { prepareOfferedParticularOrder } from "../../../application/services/offered-particular-order-preparation.js";
import { OrderCutoffNotice } from "../../../application/services/order-cutoff-notice.service.js";
import {
  type DraftedOrder,
  type DraftPolicy,
  OrderDrafting,
} from "../../../application/services/order-drafting.service.js";
import { estimateParticularOrder } from "../../../application/services/particular-order-estimation.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderReplayReader } from "../../domain/ports/backorder-replay.reader.js";
import { backorderPricingOf } from "../backorder-placement.js";
import {
  loadParticularBackorder,
  particularBackorderQuoteEntryOf,
  type ParticularBackorderQuoteEntry,
} from "../particular-backorder-entry.js";
import { QuoteParticularBackorderQuery } from "./quote-particular-backorder.query.js";

/**
 * **L'estimation de la transformation d'un reliquat de particulier** : la
 * préparation de la passation choisie (réglée en boutique ou offerte), garnie
 * du reliquat, sous la politique que la transformation applique, puis lue
 * sans être écrite — la vue de l'estimation des passations du particulier.
 * Elle n'écrit rien : ni verrou, ni commande. Le droit d'offrir ne se juge
 * pas ici : elle ne dit que des prix publics.
 */
@QueryHandler(QuoteParticularBackorderQuery)
export class QuoteParticularBackorderHandler implements IQueryHandler<
  QuoteParticularBackorderQuery,
  AdminOrderEstimateView
> {
  constructor(
    private readonly particulars: ParticularStandingReader,
    private readonly drafting: OrderDrafting,
    private readonly cutoffNotice: OrderCutoffNotice,
    private readonly backorders: BackorderRepository,
    private readonly replays: BackorderReplayReader,
  ) {}

  /**
   * @throws {BackorderNotFoundError} reliquat inconnu.
   * @throws {CompanyBackorderNeedsStaffEntryError} reliquat d'une société.
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   */
  async execute(query: QuoteParticularBackorderQuery): Promise<AdminOrderEstimateView> {
    const backorder = await loadParticularBackorder(this.backorders, query.backorderId);
    const { origin, policy } = await backorderPricingOf(this.replays, backorder);
    const entry = particularBackorderQuoteEntryOf(backorder, query.payload, origin.lines);
    return withCatalogueSnapshot(() =>
      estimateParticularOrder(
        () => this.draft(query.staffUserId, entry, policy),
        this.cutoffNotice,
        entry.payload,
      ),
    );
  }

  private draft(
    staffUserId: string,
    entry: ParticularBackorderQuoteEntry,
    policy: DraftPolicy,
  ): Promise<DraftedOrder> {
    const ports = { particulars: this.particulars, drafting: this.drafting };
    return entry.venue === "shop_till"
      ? prepareCounterParticularOrder(ports, staffUserId, entry.payload, "estimate", policy)
      : prepareOfferedParticularOrder(ports, staffUserId, entry.payload, "estimate", policy);
  }
}
