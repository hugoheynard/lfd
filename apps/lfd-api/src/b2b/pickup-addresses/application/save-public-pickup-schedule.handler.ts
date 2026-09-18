import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PublicPickupScheduleUpdatedEvent } from "../domain/pickup-address.events.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { PickupScheduleRepository } from "../domain/pickup-schedule.repository.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { PublicPickupClosure } from "../domain/public-pickup-closure.js";
import { PublicPickupSlotRule } from "../domain/public-pickup-slot-rule.js";
import { SavePublicPickupScheduleCommand } from "./save-public-pickup-schedule.command.js";

/**
 * Enregistre l'horaire public d'un point.
 *
 * Le handler **n'arbitre rien** : les value objects refusent une plage vide, un
 * badge vide ou une capacité qui ne sert personne, et l'agrégat refuse le
 * chevauchement. Ce qui est ici, c'est l'orchestration — le point existe, on
 * charge, on remplace, on écrit, on trace, le tout dans une seule unité de
 * travail pour que la trace tombe avec le réglage qu'elle décrit.
 *
 * Les value objects sont construits **avant** d'ouvrir la transaction : une
 * charge malformée n'a alors ouvert aucune transaction, et le refus est le même
 * quel que soit le chemin d'entrée.
 */
@CommandHandler(SavePublicPickupScheduleCommand)
export class SavePublicPickupScheduleHandler implements ICommandHandler<
  SavePublicPickupScheduleCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly schedules: PickupScheduleRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} le point n'existe pas.
   * @throws {PublicPickupSlotRulesOverlapError} deux plages se chevauchent.
   */
  async execute(command: SavePublicPickupScheduleCommand): Promise<void> {
    const rules = command.payload.rules.map((rule) => PublicPickupSlotRule.of(rule));
    const closures = command.payload.closures.map((closure) => PublicPickupClosure.of(closure));
    await this.uow.run(async () => {
      const point = await this.pickups.resolve(command.pickupAddressId);
      if (point === null) {
        throw new PickupAddressNotFoundError(command.pickupAddressId);
      }
      const schedule = await this.schedules.load(command.pickupAddressId);
      schedule.replace(rules, closures);
      await this.schedules.save(schedule);
      await this.events.publishTraced(
        new PublicPickupScheduleUpdatedEvent(
          command.pickupAddressId,
          point.label,
          schedule.ruleCount,
          schedule.closureCount,
        ),
      );
    });
  }
}
