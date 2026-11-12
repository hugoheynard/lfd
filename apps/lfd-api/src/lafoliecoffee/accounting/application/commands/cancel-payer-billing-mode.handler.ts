import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingPayerNotFoundError } from "../../domain/errors/billing-mode-errors.js";
import { PayerBillingModeChangedEvent } from "../../domain/events/billing-mode.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { PayerBillingModeRepository } from "../../domain/ports/payer-billing-mode.repository.js";
import { PayerChangeLock } from "../../domain/ports/payer-change-lock.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { loadOrFail } from "../legal-entity-support.js";
import { CancelPayerBillingModeCommand } from "./cancel-payer-billing-mode.command.js";

/**
 * Annule le mode programmé d'un payeur. Pas de garde « payeur » ici : un
 * compte devenu site depuis le geste doit pouvoir défaire ce qui avait été
 * programmé pour lui. L'historique refuse quand rien n'est programmé.
 */
@CommandHandler(CancelPayerBillingModeCommand)
export class CancelPayerBillingModeHandler implements ICommandHandler<
  CancelPayerBillingModeCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly standings: PayerStandingReader,
    private readonly payerModes: PayerBillingModeRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly lock: PayerChangeLock,
  ) {}

  async execute(command: CancelPayerBillingModeCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    const standing = await this.standings.standingOf(command.payerCompanyId, at);
    if (standing === null) {
      throw new BillingPayerNotFoundError(command.payerCompanyId);
    }
    const payer = { id: standing.companyId, name: standing.name };
    // Sous le verrou du payeur (K11), comme la pose : un changement remplacé
    // pendant l'annulation est relu, jamais annulé à la place d'un autre.
    await this.uow.run(async () => {
      await this.lock.lock(payer.id);
      const history = await this.payerModes.load(entity.id, payer);
      const change = history.cancelScheduled({ at, staffId: command.staffId });
      await this.payerModes.save(history);
      await this.events.publishTraced(
        new PayerBillingModeChangedEvent(payer, { id: entity.id, name: entity.name }, at, change),
      );
    });
  }
}
