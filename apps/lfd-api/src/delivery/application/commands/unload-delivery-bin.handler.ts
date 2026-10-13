import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBinUnloadedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { type BinOwnerNames, citedOwnerOf, loadingOfBin } from "../bin-owner-support.js";
import { loadBin } from "../delivery-loading-support.js";
import { UnloadDeliveryBinCommand } from "./unload-delivery-bin.command.js";

/**
 * **Décharge un bac** d'une tournée encore au dépôt : sa ligne de chargement
 * reste, ses `loaded_*` redeviennent nuls, et le fait au journal garde qui
 * avait chargé, et quand. Un bac qui n'était pas chargé ici n'écrit rien.
 *
 * @throws {DeliveryBinNotFoundError} @throws {BinInOtherRoundError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(UnloadDeliveryBinCommand)
export class UnloadDeliveryBinHandler implements ICommandHandler<UnloadDeliveryBinCommand, void> {
  constructor(
    private readonly bins: DeliveryBinRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly transfers: InternalTransfersReader,
    private readonly directory: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnloadDeliveryBinCommand): Promise<void> {
    await this.uow.run(async () => {
      const bin = await loadBin(this.bins, command.binId);
      const loading = await loadingOfBin(this.loadings, bin);
      const previous = loading?.unload({ roundId: command.roundId, binId: bin.id }) ?? null;
      if (loading === null || previous === null) {
        return;
      }
      await this.loadings.save(loading);
      const author = await deliveryAuthorOf(this.directory, previous.loadedBy);
      await this.events.publishTraced(
        new DeliveryBinUnloadedEvent(
          bin,
          await citedOwnerOf(this.names(), bin),
          loading,
          previous,
          author.name === "" ? author.staffUserId : { id: author.staffUserId, name: author.name },
        ),
      );
    });
  }

  private names(): BinOwnerNames {
    return { orders: this.orders, transfers: this.transfers };
  }
}
