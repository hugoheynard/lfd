import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import type { DeliveryRound } from "../../domain/entities/delivery-round.js";
import { DoorstepStopNotFoundError } from "../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { StopNotATransferError } from "../../domain/errors/internal-transfer-errors.js";
import { InternalTransferReceivedEvent } from "../../domain/events/internal-transfer.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { InternalTransferRepository } from "../../domain/ports/internal-transfer.repository.js";
import { ensureFreshForDriver, gesturePositionOf } from "../doorstep-support.js";
import { loadTransfer } from "../internal-transfer-support.js";
import { DropTransferAtSiteCommand } from "./drop-transfer-at-site.command.js";

/**
 * **« Remis au site »** (plan du transfert interne, §6.3, Q-T6, lot T2) — le
 * seul geste d'un arrêt de transfert, et ce qui permet à la tournée de se
 * terminer (I9 : tout arrêt vivant doit avoir un sort).
 *
 * Dans UNE unité de travail :
 * 1. la tournée est chargée et verrouillée SOUS LE MUR du livreur ;
 * 2. un arrêt déjà clos répond « déjà fait » — avant la version (AP-D6) ;
 * 3. la tournée roule encore, la version présentée est la bonne ;
 * 4. le transfert de l'arrêt est REÇU (garde passée au site) — sauf s'il
 *    l'est déjà, réceptionné au comptoir avant l'arrivée : l'arrêt se clôt
 *    alors sans seconde réception ;
 * 5. `closeStop`, avec la position du téléphone (YA-D4), les deux `save`, le fait.
 *
 * @throws {DriverRoundNotFoundError} @throws {DoorstepStopNotFoundError}
 * @throws {StopNotATransferError} @throws {DoorstepRoundStaleError}
 * @throws {DoorstepRoundNotDepartedError} @throws {DeliveryRoundReturnedError}
 * @throws {TransferAlreadyReceivedError} un comptoir l'a reçu pendant le geste.
 */
@CommandHandler(DropTransferAtSiteCommand)
export class DropTransferAtSiteHandler implements ICommandHandler<DropTransferAtSiteCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly transfers: InternalTransferRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DropTransferAtSiteCommand): Promise<void> {
    const position = gesturePositionOf(command.payload);
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDriver(command.roundId, command.staffUserId);
      if (round === null) {
        throw new DriverRoundNotFoundError();
      }
      if (round.hasClosed(command.stopId)) {
        return;
      }
      round.ensureOnTheRoad();
      ensureFreshForDriver(round, command.payload.version);
      const transfer = await loadTransfer(
        this.transfers,
        transferOfLiveStop(round, command.stopId),
      );
      const at = this.clock.now();
      const receiving = transfer.status !== "received";
      if (receiving) {
        transfer.receive({ at, by: command.staffUserId, reason: null });
      }
      round.closeStop(command.stopId, at, position);
      await this.rounds.save(round);
      if (receiving) {
        await this.transfers.save(transfer);
        await this.events.publishTraced(
          new InternalTransferReceivedEvent(transfer, "site_drop", false),
        );
      }
    });
  }
}

/** Le transfert d'un arrêt vivant de la tournée — sinon il n'est pas à elle. */
function transferOfLiveStop(round: DeliveryRound, stopId: string): string {
  const stop = round.liveStops.find((candidate) => candidate.id === stopId);
  if (stop === undefined) {
    throw new DoorstepStopNotFoundError();
  }
  if (stop.kind !== "transfer") {
    throw new StopNotATransferError();
  }
  return stop.transferId;
}
