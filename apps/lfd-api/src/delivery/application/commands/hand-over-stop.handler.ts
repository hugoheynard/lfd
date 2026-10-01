import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  DoorstepHandoverAttestor,
  type StagedHandoverProofs,
} from "../../channels/handover/index.js";
import type { DeliveryRound } from "../../domain/entities/delivery-round.js";
import type { DoorstepStop } from "../../domain/entities/doorstep-stop.js";
import {
  DoorstepStopNotFoundError,
  StopClosedWithoutHandoverError,
} from "../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import {
  citeStopOrder,
  DeliveryStopHandedOverEvent,
} from "../../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DoorstepStopRepository } from "../../domain/ports/doorstep-stop.repository.js";
import { DoorstepReceipt } from "../../domain/value-objects/doorstep-receipt.js";
import { ensureFreshForDriver } from "../doorstep-support.js";
import { HandOverStopCommand } from "./hand-over-stop.command.js";

const logger = new Logger("HandOverStop");
const PUBLISH = "doorstep-handover-published";

/** La tournée verrouillée et l'arrêt, tous deux lus sous le mur du livreur. */
interface WalledStop {
  readonly round: DeliveryRound;
  readonly stop: DoorstepStop;
}

/**
 * **« Remis au client »** (`documentation/livraisons/plan-a-la-porte.md`, B1,
 * § 9, § 10 bis, AP-D1, AP-D6, L6-C7).
 *
 * 1. Les pièces sont refusées AVANT tout envoi : photo, nom (2 à 80), images
 *    lisibles. Puis rangées au stockage par le retrait, hors transaction.
 * 2. Dans UNE unité de travail : la tournée verrouillée et l'arrêt, SOUS LE
 *    MUR du livreur ; un arrêt déjà clos par une remise à la porte republie
 *    l'attestation existante et répond « déjà fait » — clos autrement, refus
 *    nommé ; puis la version présentée, la signature exigée au départ,
 *    l'attestation (sans publier), `closeStop` par l'agrégat, le fait.
 * 3. 🔴 La publication vers le commerce part APRÈS la validation
 *    (`AfterCommit`, B0) : une clôture qui échoue ne laisse ni commande
 *    `fulfilled`, ni point. Une remise qui n'a pas eu lieu retire ses images.
 *
 * @throws {DriverRoundNotFoundError} @throws {DoorstepStopNotFoundError}
 * @throws {StopClosedWithoutHandoverError} @throws {DoorstepRoundStaleError}
 * @throws ceux de `DoorstepReceipt`, du retrait, et de `closeStop`.
 */
@CommandHandler(HandOverStopCommand)
export class HandOverStopHandler implements ICommandHandler<HandOverStopCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly stops: DoorstepStopRepository,
    private readonly attestor: DoorstepHandoverAttestor,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly afterCommit: AfterCommit,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: HandOverStopCommand): Promise<void> {
    const receipt = DoorstepReceipt.take({
      receiverName: command.fields.receiverName,
      photo: command.photo,
      signature: command.signature,
    });
    const staged = await this.attestor.stageProofs({
      photo: receipt.photo,
      signature: receipt.signature,
    });
    let handedOver = false;
    try {
      handedOver = await this.uow.run(() => this.handOver(command, receipt, staged));
    } finally {
      if (!handedOver) {
        await this.discard(staged);
      }
    }
  }

  /** Rend `true` si CETTE remise a été écrite ; `false` : « déjà fait ». */
  private async handOver(
    command: HandOverStopCommand,
    receipt: DoorstepReceipt,
    staged: StagedHandoverProofs,
  ): Promise<boolean> {
    const { round, stop } = await this.walled(command);
    if (round.hasClosed(stop.stopId)) {
      await this.replay(stop);
      return false;
    }
    // Rentrée, la tournée ne prend plus de geste (PL2) — dit avant la version.
    round.ensureOnTheRoad();
    ensureFreshForDriver(round, command.fields.version);
    const reference = stop.reference === "" ? stop.orderId : stop.reference;
    receipt.ensureSignedIf(stop.signatureRequired, reference);
    const publish = await this.attestor.attest({
      orderId: stop.orderId,
      by: command.staffUserId,
      receiverName: receipt.receiverName,
      proofs: staged,
    });
    round.closeStop(stop.stopId, this.clock.now());
    await this.rounds.save(round);
    await this.events.publishTraced(
      new DeliveryStopHandedOverEvent(
        round,
        citeStopOrder(stop.orderId, stop.reference),
        receipt.signed,
      ),
    );
    this.afterCommit.defer(publish, PUBLISH);
    return true;
  }

  private async walled(command: HandOverStopCommand): Promise<WalledStop> {
    const round = await this.rounds.loadForDriver(command.roundId, command.staffUserId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const stop = await this.stops.loadForDriver(
      command.roundId,
      command.stopId,
      command.staffUserId,
    );
    if (stop === null) {
      throw new DoorstepStopNotFoundError();
    }
    return { round, stop };
  }

  /**
   * Rejoué sur un arrêt clos (§ 10 bis) : remis à la porte, l'attestation
   * existante repart vers le commerce — c'est ce qui répare un `fulfilled`
   * manqué ; clos sans remise, le livreur l'apprend.
   */
  private async replay(stop: DoorstepStop): Promise<void> {
    const publish = await this.attestor.republication(stop.orderId);
    if (publish === null) {
      throw new StopClosedWithoutHandoverError(
        stop.reference === "" ? stop.orderId : stop.reference,
      );
    }
    this.afterCommit.defer(publish, PUBLISH);
  }

  private async discard(staged: StagedHandoverProofs): Promise<void> {
    await this.attestor.discardProofs(staged).catch((cause: unknown) => {
      logger.warn(`Pièces d'une remise non faite, orphelines au stockage : ${String(cause)}`);
    });
  }
}
