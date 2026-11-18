import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { VatRateLock } from "../domain/ports/vat-rate.lock.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";
import { requireRate } from "./vat-support.js";

export class RestoreVatRateCommand {
  constructor(readonly id: string) {}
}

/**
 * Remet un taux archivé en service : il se propose de nouveau. Rejoué sur un
 * taux en service : ni écriture, ni fait, ni réémission.
 *
 * Chargé dans la transaction sous le verrou exclusif du taux, et seul
 * `archived_at` est écrit : un renommage concurrent n'est pas effacé.
 */
@CommandHandler(RestoreVatRateCommand)
export class RestoreVatRateHandler implements ICommandHandler<RestoreVatRateCommand, void> {
  constructor(
    private readonly rates: VatRateRepository,
    private readonly lock: VatRateLock,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: RestoreVatRateCommand): Promise<void> {
    const restored = await this.uow.run(async () => {
      await this.lock.forArchival(command.id);
      const rate = await requireRate(this.rates, command.id);
      if (!rate.restore()) {
        return false;
      }
      const { name, percent } = rate.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.vatRateRestored,
        subjectType: "vat_rate",
        subjectId: command.id,
        payload: { subjectLabel: name, name, percent },
      });
      await this.rates.saveArchival(rate, ticket);
      return true;
    });
    if (!restored) {
      return;
    }
    await this.reemission.everything();
  }
}
