import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { VolumeCommitmentClosedEvent } from "../../domain/volume-commitment.events.js";
import { VolumeCommitmentRepository } from "../../domain/ports/volume-commitment.repository.js";
import { VolumeCommitmentNotFoundError } from "../../domain/pricing-errors.js";
import { CloseVolumeCommitmentCommand } from "./close-volume-commitment.command.js";

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
        commitment.close(command.staffUserId, this.clock.now(), command.reason),
      );
      await this.events.publishTraced(new VolumeCommitmentClosedEvent(command.id, command.reason));
    });
  }
}
