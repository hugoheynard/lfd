import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateVolumeCommitmentPayload } from "@lfd/contracts";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  VolumeCommitmentClosedEvent,
  VolumeCommitmentSignedEvent,
} from "../../domain/volume-commitment.events.js";
import { VolumeCommitmentAggregate } from "../../domain/entities/volume-commitment.js";
import { VolumeCommitmentRepository } from "../../domain/ports/volume-commitment.repository.js";
import { VolumeCommitmentNotFoundError } from "../../domain/pricing-errors.js";

/** **Signer** un engagement de volume pour un client. */
export class SignVolumeCommitmentCommand {
  constructor(
    readonly payload: CreateVolumeCommitmentPayload,
    readonly staffSub: string,
  ) {}
}

/**
 * **Clore** un engagement. Terminal, et sans effet rétroactif.
 *
 * Clore ne révise aucune commande passée : chacune garde le palier qu'elle a
 * mérité, sa trace le dit, et c'est toute la raison d'avoir choisi le cumul
 * plutôt qu'un prix fixe. La clôture libère seulement la période.
 */
export class CloseVolumeCommitmentCommand {
  constructor(
    readonly id: string,
    readonly reason: string | null,
    readonly staffSub: string,
  ) {}
}

@CommandHandler(SignVolumeCommitmentCommand)
export class SignVolumeCommitmentHandler implements ICommandHandler<
  SignVolumeCommitmentCommand,
  string
> {
  constructor(
    private readonly commitments: VolumeCommitmentRepository,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SignVolumeCommitmentCommand): Promise<string> {
    const { payload } = command;
    const commitment = VolumeCommitmentAggregate.sign(
      this.ids.next(),
      {
        companyId: payload.companyId,
        scope: payload.scope,
        promisedQuantity: payload.promisedQuantity,
        validFrom: new Date(payload.validFrom),
        validTo: new Date(payload.validTo),
      },
      command.staffSub,
    );
    await this.uow.run(async () => {
      await this.commitments.sign(commitment);
      await this.events.publishTraced(new VolumeCommitmentSignedEvent(commitment));
    });
    return commitment.id;
  }
}

@CommandHandler(CloseVolumeCommitmentCommand)
export class CloseVolumeCommitmentHandler implements ICommandHandler<
  CloseVolumeCommitmentCommand,
  void
> {
  constructor(
    private readonly commitments: VolumeCommitmentRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CloseVolumeCommitmentCommand): Promise<void> {
    const commitment = await this.commitments.load(command.id);
    if (commitment === null) {
      throw new VolumeCommitmentNotFoundError(command.id);
    }
    await this.uow.run(async () => {
      await this.commitments.save(
        commitment.close(command.staffSub, this.clock.now(), command.reason),
      );
      await this.events.publishTraced(new VolumeCommitmentClosedEvent(command.id, command.reason));
    });
  }
}
