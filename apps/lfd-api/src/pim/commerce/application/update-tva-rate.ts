import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { TvaRateRepository } from "../domain/ports/tva-rate.repository.js";
import type { TvaRatePayload } from "./create-tva-rate.js";
import { ensureRateFree, requireRegime } from "./tva-support.js";

export class UpdateTvaRateCommand {
  constructor(
    readonly id: string,
    readonly payload: TvaRatePayload,
  ) {}
}

@CommandHandler(UpdateTvaRateCommand)
export class UpdateTvaRateHandler implements ICommandHandler<UpdateTvaRateCommand, void> {
  constructor(
    private readonly regimes: TvaRateRepository,
    private readonly journal: PimJournal,
  ) {}

  /**
   * Le taux d'AVANT est lu avant la révision : après, l'agrégat ne s'en souvient
   * plus, et un journal qui ne dit pas d'où l'on vient ne sert à rien.
   */
  async execute(command: UpdateTvaRateCommand): Promise<void> {
    const regime = await requireRegime(this.regimes, command.id);
    const before = regime.snapshot();
    const { payload } = command;
    regime.revise(payload.name, payload.description ?? "", payload.percent);
    await ensureRateFree(this.regimes, regime.percent, regime.id);
    await this.regimes.save(regime);
    await this.journalize(before, regime.snapshot());
  }

  /**
   * Deux faits distincts, parce qu'ils n'ont pas le même aval : un taux qui
   * bouge change ce qui est facturé, un nom qui change ne change rien. Les
   * confondre sous un « taux modifié » obligerait à ouvrir le payload pour
   * savoir si l'événement compte.
   */
  private async journalize(
    before: { name: string; percent: number },
    after: { id: string; name: string; percent: number },
  ): Promise<void> {
    if (before.percent !== after.percent) {
      // La portée : ce que ce taux touchait à l'instant du changement.
      const usage = (await this.regimes.usageByRegime()).get(after.id);
      await this.journal.record({
        type: PIM_EVENTS.tvaRateRateChanged,
        subjectType: "tva_rate",
        subjectId: after.id,
        payload: { name: after.name, from: before.percent, to: after.percent },
        blast: {
          familiesEmporter: usage?.emporter ?? 0,
          familiesSurPlace: usage?.surPlace ?? 0,
        },
      });
    }
    if (before.name !== after.name) {
      await this.journal.record({
        type: PIM_EVENTS.tvaRateRenamed,
        subjectType: "tva_rate",
        subjectId: after.id,
        payload: { from: before.name, to: after.name },
      });
    }
  }
}
