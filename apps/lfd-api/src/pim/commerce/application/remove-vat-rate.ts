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
  ) {}

  /**
   * Journalise APRÈS la suppression : la base refuse (`Restrict`) un taux
   * encore visé, et une trace de suppression pour une suppression qui n'a pas
   * eu lieu est pire que pas de trace du tout.
   */
  async execute(command: RemoveVatRateCommand): Promise<void> {
    const rate = await requireRate(this.rates, command.id);
    const { name, percent } = rate.snapshot();
    await this.rates.remove(command.id);
    await this.journal.record({
      type: PIM_EVENTS.vatRateDeleted,
      subjectType: "tva_rate",
      subjectId: command.id,
      payload: { name, percent },
    });
  }
}
