import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";
import { requireRate } from "./vat-support.js";

export class RemoveVatRateCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(RemoveVatRateCommand)
export class RemoveVatRateHandler implements ICommandHandler<RemoveVatRateCommand, void> {
  constructor(
    private readonly rates: VatRateRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Le ticket est pris AVANT la suppression, mais dans la MÊME transaction — et
   * c'est la transaction qui compte, pas l'ordre des lignes.
   *
   * La base refuse (`Restrict`) un taux qu'une famille ou une fiche vise encore.
   * Ce refus emporte la trace avec lui : une trace de suppression pour une
   * suppression qui n'a pas eu lieu est pire que pas de trace du tout.
   */
  async execute(command: RemoveVatRateCommand): Promise<void> {
    const rate = await requireRate(this.rates, command.id);
    const { name, percent } = rate.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.vatRateDeleted,
        subjectType: "vat_rate",
        subjectId: command.id,
        payload: { name, percent },
      });
      await this.rates.remove(command.id, ticket);
    });
  }
}
