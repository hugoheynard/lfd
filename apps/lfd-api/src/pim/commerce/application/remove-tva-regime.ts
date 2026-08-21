import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";
import { requireRegime } from "./tva-support.js";

export class RemoveTvaRegimeCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(RemoveTvaRegimeCommand)
export class RemoveTvaRegimeHandler implements ICommandHandler<RemoveTvaRegimeCommand, void> {
  constructor(
    private readonly regimes: TvaRegimeRepository,
    private readonly journal: PimJournal,
  ) {}

  /**
   * Journalise APRÈS la suppression : la base refuse (`Restrict`) un régime
   * encore visé, et une trace de suppression pour une suppression qui n'a pas
   * eu lieu est pire que pas de trace du tout.
   */
  async execute(command: RemoveTvaRegimeCommand): Promise<void> {
    const regime = await requireRegime(this.regimes, command.id);
    const { name, percent } = regime.snapshot();
    await this.regimes.remove(command.id);
    await this.journal.record({
      type: PIM_EVENTS.tvaRegimeDeleted,
      subjectType: "tva_regime",
      subjectId: command.id,
      payload: { name, percent },
    });
  }
}
