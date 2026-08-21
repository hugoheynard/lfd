import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { TvaRate } from "../domain/entities/tva-rate.js";
import { TvaRateRepository } from "../domain/ports/tva-rate.repository.js";
import { ensureRateFree } from "./tva-support.js";

export interface TvaRatePayload {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

export class CreateTvaRateCommand {
  constructor(readonly payload: TvaRatePayload) {}
}

@CommandHandler(CreateTvaRateCommand)
export class CreateTvaRateHandler implements ICommandHandler<CreateTvaRateCommand, string> {
  constructor(
    private readonly rates: TvaRateRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
  ) {}

  /**
   * L'agrégat naît d'abord — il valide le taux — et c'est CE taux qu'on
   * confronte aux autres. L'ordre compte : chercher une collision avant de
   * savoir le taux valide reviendrait à comparer un nombre qui n'en est pas un.
   */
  async execute(command: CreateTvaRateCommand): Promise<string> {
    const { payload } = command;
    const rate = TvaRate.open({
      id: this.ids.next(),
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
    });
    await ensureRateFree(this.rates, rate.percent, null);
    await this.rates.add(rate);
    // Pas de portée : un taux qui naît ne vise encore aucune famille.
    await this.journal.record({
      type: PIM_EVENTS.tvaRateCreated,
      subjectType: "tva_rate",
      subjectId: rate.id,
      payload: { name: payload.name, percent: payload.percent },
    });
    return rate.id;
  }
}
