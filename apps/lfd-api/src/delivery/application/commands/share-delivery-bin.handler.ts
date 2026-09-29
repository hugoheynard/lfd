import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBin } from "../../domain/entities/delivery-bin.js";
import { DeliveryBinSharedEvent } from "../../domain/events/delivery-loading.events.js";
import { BinCodeDrawer } from "../../domain/ports/bin-code-drawer.js";
import { BinTypeLookup } from "../../domain/ports/bin-type-lookup.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import {
  citedOrderOf,
  declarableReference,
  drawBinCode,
  loadBin,
  lookUpBinType,
} from "../delivery-loading-support.js";
import { ShareDeliveryBinCommand } from "./share-delivery-bin.command.js";

/**
 * **Partage un bac** (lot 4 bis, v2-4 — dernier recours, Q2) : déclare, pour
 * une commande, l'AUTRE moitié d'un bac cloisonné dont une moitié est déjà à
 * une autre commande. Même type, côté opposé, même bac physique.
 *
 * Refusé si les deux commandes ne sont pas dans la même tournée au dépôt, à
 * des arrêts CONSÉCUTIFS — c'est la tournée de la commande qui en juge,
 * verrouillée en partage, et la moitié partenaire est verrouillée en exclusif
 * APRÈS elle puis RELUE : un partage, une annulation ou un chargement
 * concurrents de la même moitié se sérialisent.
 *
 * @throws {DeliveryBinNotFoundError} @throws {BinNotShareableError}
 * @throws {BinHalfTakenError} @throws {SharedBinNotAdjacentError}
 * @throws {BinTypeArchivedForDeclarationError} @throws {InvalidInnerBagsError}
 * @throws {BinsNotDeclarableError} @throws {DeliveryRoundDepartedError}
 * @throws {DeliveryLoadingStaleError} @throws {BinHalfRaceError}
 */
@CommandHandler(ShareDeliveryBinCommand)
export class ShareDeliveryBinHandler implements ICommandHandler<ShareDeliveryBinCommand, string> {
  constructor(
    private readonly bins: DeliveryBinRepository,
    private readonly binTypes: BinTypeLookup,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly drawer: BinCodeDrawer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ShareDeliveryBinCommand): Promise<string> {
    const { orderId, partnerBinId, innerBags } = command.payload;
    return this.uow.run(async () => {
      const reference = await declarableReference(this.orders, orderId);
      const loading = await this.loadings.forOrder(orderId, partnerBinId);
      // Relue SOUS le verrou : une annulation ou un partage concurrents sont passés.
      const partner = await loadBin(this.bins, partnerBinId);
      const partnerOrder = await citedOrderOf(this.orders, partner.orderId);
      const binType = await lookUpBinType(this.binTypes, partner.binTypeId);
      const code = await drawBinCode(this.drawer, this.bins);
      const bin = DeliveryBin.shareHalf({
        orderId,
        partner,
        liveHalves:
          partner.physicalBinId === null ? [] : await this.bins.liveHalvesOf(partner.physicalBinId),
        binType,
        identity: { id: this.ids.next(), code },
        innerBags,
        names: {
          reference,
          partnerReference: typeof partnerOrder === "string" ? partnerOrder : partnerOrder.name,
        },
        at: this.clock.now(),
        loading,
      });
      await this.bins.declare([bin]);
      await this.events.publishTraced(
        new DeliveryBinSharedEvent(
          { id: orderId, name: reference },
          { id: binType.id, name: binType.name },
          bin,
          partner,
          partnerOrder,
        ),
      );
      return bin.id;
    });
  }
}
