import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { staffUnsubscribeAddressOf } from "../../domain/services/staff-unsubscribe-address.js";
import { MarketingUnsubscribedByStaffEvent } from "../../domain/marketing-preference.events.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { MarketingUnsubscriber } from "../services/marketing-unsubscriber.js";
import { UnsubscribeAddressByStaffCommand } from "./unsubscribe-address-by-staff.command.js";

/**
 * Désinscrit l'adresse par l'écriture unique de la désinscription
 * (`MarketingUnsubscriber`, source `staff`), puis trace le geste sur la ligne
 * touchée — l'adresse n'est jamais au journal.
 */
@CommandHandler(UnsubscribeAddressByStaffCommand)
export class UnsubscribeAddressByStaffHandler implements ICommandHandler<
  UnsubscribeAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: MarketingAddresses,
    private readonly unsubscriber: MarketingUnsubscriber,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {InvalidStaffUnsubscribeAddressError} l'adresse n'a pas la forme d'une adresse e-mail. */
  async execute({ space, address }: UnsubscribeAddressByStaffCommand): Promise<void> {
    const target = this.addresses.of(staffUnsubscribeAddressOf(address));
    await this.uow.run(async () => {
      const done = await this.unsubscriber.unsubscribe(space, target, {
        at: this.clock.now(),
        source: "staff",
      });
      await this.events.publishTraced(
        new MarketingUnsubscribedByStaffEvent(done.preferenceId, space, done.changed),
      );
    });
  }
}
