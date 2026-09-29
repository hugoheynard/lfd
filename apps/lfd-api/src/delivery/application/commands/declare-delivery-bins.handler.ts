import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBin } from "../../domain/entities/delivery-bin.js";
import { DeliveryBinsDeclaredEvent } from "../../domain/events/delivery-loading.events.js";
import { BinCodeDrawer } from "../../domain/ports/bin-code-drawer.js";
import { BinTypeLookup } from "../../domain/ports/bin-type-lookup.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { BinDeclaration } from "../../domain/value-objects/bin-declaration.js";
import { declarableReference, drawBinCodes, lookUpBinType } from "../delivery-loading-support.js";
import { DeclareDeliveryBinsCommand } from "./declare-delivery-bins.command.js";

/**
 * **Déclare des bacs d'un type** pour une commande (lot 4, L4-C16 ; lot 4
 * bis, tranche B) : `whole` bacs entiers, et au besoin une moitié — la gauche
 * d'un bac physique neuf. Un bac naît ici, jamais à l'impression ; en ajouter
 * un plus tard, c'est en déclarer un de plus. Chacun reçoit un code court tiré
 * au sort, libre sur tous les bacs (L4-C20). UN fait au journal.
 *
 * La déclaration est validée ENTIÈRE (type en service, cloison, bornes) avant
 * qu'aucun code ne se tire. La commande doit exister, être en livraison et non
 * annulée ; si elle est déjà dans une tournée, celle-ci est verrouillée en
 * partage : une tournée partie ne reçoit plus de bac.
 *
 * @throws {BinTypeNotFoundError} @throws {BinTypeArchivedForDeclarationError}
 * @throws {BinTypeNotDivisibleError} @throws {InvalidBinDeclarationCountError}
 * @throws {InvalidInnerBagsError} @throws {BinsNotDeclarableError}
 * @throws {DeliveryRoundDepartedError} @throws {BinCodeExhaustedError}
 * @throws {BinCodeCollisionError}
 */
@CommandHandler(DeclareDeliveryBinsCommand)
export class DeclareDeliveryBinsHandler implements ICommandHandler<
  DeclareDeliveryBinsCommand,
  readonly string[]
> {
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

  async execute(command: DeclareDeliveryBinsCommand): Promise<readonly string[]> {
    const { orderId, binTypeId, whole, half, innerBags } = command.payload;
    return this.uow.run(async () => {
      const binType = await lookUpBinType(this.binTypes, binTypeId);
      const declaration = BinDeclaration.of({ binType, whole, half, innerBags });
      const reference = await declarableReference(this.orders, orderId);
      const loading = await this.loadings.forOrder(orderId);
      const codes = await drawBinCodes(this.drawer, this.bins, declaration.count);
      const bins = DeliveryBin.declare({
        orderId,
        declaration,
        identities: codes.map((code) => ({ id: this.ids.next(), code })),
        physicalBinId: this.ids.next(),
        at: this.clock.now(),
        loading,
      });
      await this.bins.declare(bins);
      await this.events.publishTraced(
        new DeliveryBinsDeclaredEvent(
          { id: orderId, name: reference },
          { id: binType.id, name: binType.name },
          declaration.innerBags,
          bins,
        ),
      );
      return bins.map((bin) => bin.id);
    });
  }
}
