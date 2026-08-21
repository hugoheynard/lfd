import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { TvaRateRepository } from "../domain/ports/tva-rate.repository.js";
import { requireRegime } from "./tva-support.js";

export class RemoveTvaRateCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(RemoveTvaRateCommand)
export class RemoveTvaRateHandler implements ICommandHandler<RemoveTvaRateCommand, void> {
  constructor(
    private readonly regimes: TvaRateRepository,
    private readonly journal: PimJournal,
  ) {}

  /**
   * Journalise APRÈS la suppression : la base refuse (`Restrict`) un taux
   * encore visé, et une trace de suppression pour une suppression qui n'a pas
   * eu lieu est pire que pas de trace du tout.
   */
  async execute(command: RemoveTvaRateCommand): Promise<void> {
    const regime = await requireRegime(this.regimes, command.id);
    const { name, percent } = regime.snapshot();
    await this.regimes.remove(command.id);
    await this.journal.record({
      type: PIM_EVENTS.tvaRateDeleted,
      subjectType: "tva_rate",
      subjectId: command.id,
      payload: { name, percent },
    });
  }
}
