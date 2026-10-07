import { DeliveryProductsReader } from "../channels/commerce/index.js";
import { DeclaredBinsReader } from "../domain/ports/declared-bins.reader.js";
import type { DeliveryBinFreeHalvesView, DeliveryPackingProposalView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  BinDesk,
  type BinDeclarationRequest,
  type BinShareRequest,
  type DeskBin,
  type DeskCapacity,
  type DeskColdPacking,
} from "../../packing/channels/delivery/index.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type { DeliveryBin } from "../domain/entities/delivery-bin.js";
import { BinCatalogReader } from "../domain/ports/bin-catalog.reader.js";
import { DeliveryBinOffice } from "./delivery-bin-office.js";
import { GetDeliveryBinFreeHalvesHandler } from "./queries/get-delivery-bin-free-halves.handler.js";
import { GetDeliveryBinFreeHalvesQuery } from "./queries/get-delivery-bin-free-halves.query.js";
import { GetDeliveryPackingProposalHandler } from "./queries/get-delivery-packing-proposal.handler.js";
import { GetDeliveryPackingProposalQuery } from "./queries/get-delivery-packing-proposal.query.js";

/** Une déclaration acceptée qui ne rend aucun bac : un défaut, jamais un refus. */
class DeskDeclaredNothingError extends TechnicalError {
  constructor() {
    super(
      "delivery.bin_desk.declared_nothing",
      "La déclaration du bac a été acceptée sans qu'aucun bac ne naisse : rien n'a été écrit. Signalez-le à l'équipe technique.",
    );
  }
}

/** Le bac vu du colisage : son identifiant (celui du QR), son code, sa moitié. */
function deskBinOf(bin: DeliveryBin): DeskBin {
  return { binId: bin.id, code: bin.code, half: bin.half };
}

/**
 * **Le guichet des bacs, tenu par la livraison pour le colisage** (K2b,
 * `colisage/colisage.md` §5–§5.1) — implémente `BinDesk`,
 * que le colisage déclare.
 *
 * Il ne refait aucune règle : il passe par `DeliveryBinOffice`, celui-là même
 * que servent les anciennes routes, et ses refus remontent tels quels. Il ne
 * lit PAS `ContainerManagedOrders` — c'est justement la porte réservée aux
 * commandes gérées au colisage.
 *
 * Chaque geste rejoint l'unité de travail de l'appelant : le bac et son
 * contenant s'écrivent ensemble, ou pas du tout.
 *
 * « Proposer » passe par le cas de lecture nommé de la livraison
 * (`GetDeliveryPackingProposalHandler`), qui reste la seule lecture des
 * contenances. Les contenances servies à « Proposer, bac par bac » sont
 * celles-là mêmes (`activeCapacities`), et les moitiés libres passent par le
 * cas de lecture de la livraison (`GetDeliveryBinFreeHalvesHandler`) : la
 * règle d'adjacence reste chez elle.
 */
@Injectable()
export class DeliveryBinDesk extends BinDesk {
  constructor(
    private readonly office: DeliveryBinOffice,
    private readonly proposals: GetDeliveryPackingProposalHandler,
    private readonly freeHalvesQuery: GetDeliveryBinFreeHalvesHandler,
    private readonly catalog: BinCatalogReader,
    private readonly declared: DeclaredBinsReader,
    private readonly products: DeliveryProductsReader,
  ) {
    super();
  }

  async declareBin(request: BinDeclarationRequest): Promise<DeskBin> {
    const [bin] = await this.office.declare({
      orderId: request.orderId,
      binTypeId: request.binTypeId,
      whole: request.half ? 0 : 1,
      half: request.half,
      innerBags: request.innerBags,
    });
    if (bin === undefined) {
      // `BinDeclaration.of` refuse une déclaration vide : un bac au moins naît.
      throw new DeskDeclaredNothingError();
    }
    return deskBinOf(bin);
  }

  async voidBin(binId: string): Promise<void> {
    await this.office.void(binId);
  }

  async shareHalf(request: BinShareRequest): Promise<DeskBin> {
    return deskBinOf(await this.office.share(request));
  }

  async propose(orderId: string): Promise<DeliveryPackingProposalView> {
    return this.proposals.execute(new GetDeliveryPackingProposalQuery(orderId));
  }

  async capacities(): Promise<readonly DeskCapacity[]> {
    return this.catalog.activeCapacities();
  }

  async freeHalves(orderId: string): Promise<DeliveryBinFreeHalvesView> {
    return this.freeHalvesQuery.execute(new GetDeliveryBinFreeHalvesQuery(orderId));
  }

  async assertAtHand(orderId: string, binIds: readonly string[]): Promise<void> {
    await this.office.assertAtHand(orderId, binIds);
  }

  async liveBins(binIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.office.liveAmong(binIds);
  }

  /**
   * Le froid vient de la fiche produit (relayée par le commerce), l'isotherme
   * du type de bac — deux faits que seule la livraison tient ensemble. Trois
   * lectures groupées, quel que soit le nombre de commandes.
   */
  async coldPacking(orderIds: readonly string[]): Promise<DeskColdPacking> {
    if (orderIds.length === 0) {
      return { coldSkus: new Set(), isothermBinIds: new Set() };
    }
    const [sold, types, bins] = await Promise.all([
      this.products.sold(),
      this.catalog.listTypes(),
      this.declared.liveAmong(orderIds),
    ]);
    const isotherm = new Set(types.filter((type) => type.isotherm).map((type) => type.id));
    return {
      coldSkus: new Set(sold.filter((product) => product.requiresCold).map((p) => p.sku)),
      isothermBinIds: new Set(
        bins.filter((bin) => isotherm.has(bin.binTypeId)).map((bin) => bin.id),
      ),
    };
  }
}
