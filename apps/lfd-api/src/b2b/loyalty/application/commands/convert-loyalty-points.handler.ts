import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyConversionForbiddenError } from "../../domain/errors/loyalty-errors.js";
import { LoyaltyVoucherIssuedEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyConversionGate } from "../../domain/ports/loyalty-conversion.gate.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";
import { ConvertLoyaltyPointsCommand } from "./convert-loyalty-points.command.js";
import { requireNamedHolder } from "./loyalty-holder-support.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";

/**
 * Convertit des points en bon d'achat (plan D2, D5).
 *
 * 🔴 Tout se joue dans UNE transaction, sous le verrou du titulaire : le droit
 * de convertir est revérifié, la somme du livre relue, puis le bon et le débit
 * écrits ensemble. Deux conversions concurrentes du même titulaire attendent
 * l'une l'autre, et la seconde lit le solde que la première a laissé — le
 * solde ne descend donc jamais sous zéro.
 *
 * Le ratio est lu maintenant et figé sur le bon : un réglage changé après ne
 * touche pas ce bon.
 */
@CommandHandler(ConvertLoyaltyPointsCommand)
export class ConvertLoyaltyPointsHandler implements ICommandHandler<
  ConvertLoyaltyPointsCommand,
  string
> {
  constructor(
    private readonly settings: LoyaltySettingsReader,
    private readonly accounts: LoyaltyAccountRepository,
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly gate: LoyaltyConversionGate,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ConvertLoyaltyPointsCommand): Promise<string> {
    const holder = LoyaltyHolder.of(command.holderKind, command.holderId);
    const named = await requireNamedHolder(this.holders, holder);
    const settings = await this.settings.read();
    return this.uow.run(async () => {
      const account = await this.accounts.loadLocked(holder);
      if (!(await this.gate.mayConvert(holder, command.actorUserId))) {
        throw new LoyaltyConversionForbiddenError();
      }
      const voucher = account.convert({
        steps: command.steps,
        settings,
        voucherId: this.ids.next(),
        entryId: this.ids.next(),
        actorUserId: command.actorUserId,
        at: this.clock.now(),
      });
      // Le bon d'abord : la ligne de débit le cite par clé étrangère.
      await this.vouchers.save(voucher);
      await this.accounts.save(account);
      await this.events.publishTraced(new LoyaltyVoucherIssuedEvent(named, voucher));
      return voucher.id;
    });
  }
}
