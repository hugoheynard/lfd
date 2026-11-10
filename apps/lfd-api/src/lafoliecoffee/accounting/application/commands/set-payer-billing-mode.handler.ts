import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PayerBillingModeChangedEvent } from "../../domain/events/billing-mode.events.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { PayerBillingModeRepository } from "../../domain/ports/payer-billing-mode.repository.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { requireBillingPayer } from "../../domain/services/billing-payer-guard.js";
import { billingModeOf } from "../../domain/value-objects/billing-mode.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetPayerBillingModeCommand } from "./set-payer-billing-mode.command.js";

/**
 * Programme le mode d'un payeur. Le domaine juge qu'il est un payeur
 * (`requireBillingPayer`), puis l'historique fixe la prise d'effet — la
 * prochaine clôture de sa suite ACTUELLE, lue sur les dates des modes — et
 * tient « un seul changement à la fois ». Son mode actuel redemandé n'est pas
 * un fait.
 */
@CommandHandler(SetPayerBillingModeCommand)
export class SetPayerBillingModeHandler implements ICommandHandler<
  SetPayerBillingModeCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly standings: PayerStandingReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModeRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPayerBillingModeCommand): Promise<void> {
    const mode = billingModeOf(command.mode);
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    const payer = requireBillingPayer(
      command.payerCompanyId,
      await this.standings.standingOf(command.payerCompanyId, at),
      at,
    );
    const history = await this.payerModes.load(entity.id, payer);
    const modes = await this.modeDates.timelinesOf(entity.id);
    const change = history.change(
      mode,
      { segmentId: this.ids.next(), at, staffId: command.staffId },
      modes,
    );
    if (change === null) {
      return;
    }
    await this.uow.run(async () => {
      await this.payerModes.save(history);
      await this.events.publishTraced(
        new PayerBillingModeChangedEvent(payer, { id: entity.id, name: entity.name }, at, change),
      );
    });
  }
}
