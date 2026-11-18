import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { VatRateLock } from "../domain/ports/vat-rate.lock.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";
import { VatRateUsageReader } from "../domain/ports/vat-rate-usage.reader.js";
import { requireRate } from "./vat-support.js";

export class ArchiveVatRateCommand {
  constructor(readonly id: string) {}
}

/**
 * Archive un taux de TVA : il ne se propose plus au choix d'une famille ou
 * d'une fiche. On ne supprime plus un taux, même jamais utilisé (décision de
 * Hugo du 2026-11-18).
 *
 * Tout se passe **dans la transaction**, sous le verrou exclusif du taux
 * (`VatRateLock`) : une pose en cours finit avant que l'archive compte, une
 * pose qui suit relit le taux archivé et refuse. Le taux est chargé APRÈS le
 * verrou, et seul `archived_at` est écrit : un renommage concurrent n'est pas
 * effacé. C'est l'agrégat qui refuse un taux porté (`VatRate.archive`). Rejoué
 * sur un taux déjà archivé : ni écriture, ni fait, ni réémission.
 */
@CommandHandler(ArchiveVatRateCommand)
export class ArchiveVatRateHandler implements ICommandHandler<ArchiveVatRateCommand, void> {
  constructor(
    private readonly rates: VatRateRepository,
    private readonly lock: VatRateLock,
    private readonly usage: VatRateUsageReader,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: ArchiveVatRateCommand): Promise<void> {
    const archived = await this.uow.run(async () => {
      await this.lock.forArchival(command.id);
      const rate = await requireRate(this.rates, command.id);
      if (!rate.archive(this.clock.now(), await this.usage.holdersOf(command.id))) {
        return false;
      }
      const { name, percent } = rate.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.vatRateArchived,
        subjectType: "vat_rate",
        subjectId: command.id,
        payload: { subjectLabel: name, name, percent },
      });
      await this.rates.saveArchival(rate, ticket);
      return true;
    });
    if (archived) {
      await this.reemission.everything();
    }
  }
}
