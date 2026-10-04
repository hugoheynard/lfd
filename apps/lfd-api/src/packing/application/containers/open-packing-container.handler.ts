import type { OpenPackingContainer } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinDesk } from "../../channels/delivery/index.js";
import type { ContainerBin } from "../../domain/entities/order-contents.js";
import {
  citeContainer,
  PackingContainerOpenedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { citedOrderOf, lockedSheet } from "./container-support.js";
import { OpenPackingContainerCommand } from "./open-packing-container.command.js";

/**
 * **Crée un contenant** dans la colonne Contenants (K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §5–§5.1).
 *
 * Un SAC naît ici. Un BAC naît chez la livraison, par `BinDesk` — déclaré, ou
 * l'autre moitié d'un bac partagé —, avec son code et son QR : ses refus
 * (type archivé, commande hors livraison, tournée partie…) remontent tels
 * quels. L'appel rejoint CETTE unité de travail : si le bac est refusé, ou si
 * le bac du colisage refuse le contenant (fermé, `counted`, plafond), rien
 * n'est écrit — ni bac, ni contenant.
 *
 * Rend l'identifiant du contenant ; le client relit le poste.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {ContainerCeilingReachedError}
 *   et les refus de la livraison pour un bac.
 */
@CommandHandler(OpenPackingContainerCommand)
export class OpenPackingContainerHandler implements ICommandHandler<
  OpenPackingContainerCommand,
  string
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly desk: BinDesk,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: OpenPackingContainerCommand): Promise<string> {
    return this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      // Le bac du colisage refuse AVANT qu'un bac ne naisse chez la livraison.
      sheet.assertCanOpenContainer();
      const bin = await this.binFor(command.orderId, command.request);
      const id = this.ids.next();
      sheet.openContainer({
        id,
        nature: bin === null ? "bag" : "bin",
        bin,
        opened: { at: this.clock.now(), by: command.staffUserId },
        voided: null,
        lines: [],
      });
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingContainerOpenedEvent(
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, id),
          bin === null ? "bag" : "bin",
        ),
      );
      return id;
    });
  }

  /** Le bac que la livraison déclare pour ce contenant, ou `null` pour un sac. */
  private async binFor(
    orderId: string,
    request: OpenPackingContainer,
  ): Promise<ContainerBin | null> {
    if (request.nature === "bag") {
      return null;
    }
    const declared =
      "partnerBinId" in request
        ? await this.desk.shareHalf({
            orderId,
            partnerBinId: request.partnerBinId,
            innerBags: request.innerBags,
          })
        : await this.desk.declareBin({
            orderId,
            binTypeId: request.binTypeId,
            half: request.half,
            innerBags: request.innerBags,
          });
    return { binId: declared.binId, code: declared.code, half: declared.half };
  }
}
