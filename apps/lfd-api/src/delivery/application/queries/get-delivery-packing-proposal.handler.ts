import type {
  BinCapacityView,
  BinTypeView,
  DeliveryPackingLineView,
  DeliveryPackingProposalView,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  DeliveryOrderLinesReader,
  DeliveryOrdersReader,
  DeliveryProductsReader,
} from "../../channels/commerce/index.js";
import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { capacityGrid } from "../../domain/services/pack-group.js";
import { proposePacking, type PackingProposal } from "../../domain/services/propose-packing.js";
import { type FreeHalf, pickShareCandidate } from "../../domain/services/share-candidate.js";
import { declarableReference } from "../delivery-loading-support.js";
import {
  packingBinView,
  packingTypeOf,
  shareCandidateView,
  unplacedView,
} from "../delivery-packing-view.js";
import { freeHalvesOfOrder } from "../free-halves-support.js";
import { GetDeliveryPackingProposalQuery } from "./get-delivery-packing-proposal.query.js";

/**
 * **Le colisage proposé d'une commande livrée** (lot 4 bis, L4b-C4, v2-3,
 * v2-4) — une LECTURE : proposer n'écrit rien, et ce n'est pas la
 * proposition qui fait foi mais la déclaration qui la suit.
 *
 * Les lignes et le froid arrivent par le canal commerce (jamais une jointure) ;
 * les types EN SERVICE et leurs contenances par le catalogue des bacs. Le cœur
 * est pur (`proposePacking`, `pickShareCandidate`) ; ce handler lit et
 * traduit.
 *
 * @throws {BinsNotDeclarableError} commande inconnue, annulée ou en retrait.
 */
@QueryHandler(GetDeliveryPackingProposalQuery)
export class GetDeliveryPackingProposalHandler implements IQueryHandler<
  GetDeliveryPackingProposalQuery,
  DeliveryPackingProposalView
> {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly lines: DeliveryOrderLinesReader,
    private readonly products: DeliveryProductsReader,
    private readonly catalog: BinCatalogReader,
    private readonly loading: DeliveryLoadingReader,
  ) {}

  async execute(query: GetDeliveryPackingProposalQuery): Promise<DeliveryPackingProposalView> {
    const reference = await declarableReference(this.orders, query.orderId);
    const [lines, allTypes, capacities] = await Promise.all([
      this.orderLines(query.orderId),
      this.catalog.listTypes(),
      this.catalog.activeCapacities(),
    ]);
    const inService = allTypes.filter((type) => type.archivedAt === null);
    const types = new Map(inService.map((type) => [type.id, type]));
    const proposal = proposePacking(lines, inService.map(packingTypeOf), capacities);
    return {
      orderId: query.orderId,
      reference,
      lines,
      bins: proposal.bins.map((entry) => packingBinView(entry, types)),
      unplaced: proposal.unplaced.map((item) => unplacedView(item, lines)),
      shareCandidate: await this.shareCandidate(query.orderId, proposal, types, capacities),
    };
  }

  /** Les lignes fusionnées par SKU, avec le froid de la fiche produit. */
  private async orderLines(orderId: string): Promise<readonly DeliveryPackingLineView[]> {
    const [lines, sold] = await Promise.all([this.lines.linesOf(orderId), this.products.sold()]);
    const cold = new Set(sold.filter((product) => product.requiresCold).map((p) => p.sku));
    const merged = new Map<string, DeliveryPackingLineView>();
    for (const line of lines) {
      const known = merged.get(line.sku);
      merged.set(line.sku, {
        sku: line.sku,
        name: known?.name ?? line.name,
        quantity: (known?.quantity ?? 0) + line.quantity,
        requiresCold: cold.has(line.sku),
      });
    }
    return [...merged.values()];
  }

  /** Le partage en dernier recours, ou `null` (v2-4). */
  private async shareCandidate(
    orderId: string,
    proposal: PackingProposal,
    types: ReadonlyMap<string, BinTypeView>,
    capacities: readonly BinCapacityView[],
  ): Promise<DeliveryPackingProposalView["shareCandidate"]> {
    if (proposal.bins.length === 0) {
      return null;
    }
    const { halves } = await freeHalvesOfOrder(this.loading, orderId);
    const candidates: FreeHalf[] = halves.map(({ bin, stop }) => ({
      binId: bin.id,
      orderId: bin.orderId,
      position: stop.position,
      binTypeId: bin.binType.id,
      isotherm: bin.binType.isotherm,
    }));
    const choice = pickShareCandidate(
      proposal.bins,
      (binTypeId) => types.get(binTypeId)?.isotherm ?? false,
      candidates,
      capacityGrid(capacities),
    );
    if (choice === null) {
      return null;
    }
    const [partner] = await this.orders.byIds([choice.half.orderId]);
    return shareCandidateView(choice, partner, types);
  }
}
