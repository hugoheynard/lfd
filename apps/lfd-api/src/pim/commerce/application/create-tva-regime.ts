import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { TvaRegime } from "../domain/entities/tva-regime.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";
import { ensureRateFree } from "./tva-support.js";

export interface TvaRegimePayload {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

export class CreateTvaRegimeCommand {
  constructor(readonly payload: TvaRegimePayload) {}
}

@CommandHandler(CreateTvaRegimeCommand)
export class CreateTvaRegimeHandler implements ICommandHandler<CreateTvaRegimeCommand, string> {
  constructor(
    private readonly regimes: TvaRegimeRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
  ) {}

  /**
   * L'agrégat naît d'abord — il valide le taux — et c'est CE taux qu'on
   * confronte aux autres. L'ordre compte : chercher une collision avant de
   * savoir le taux valide reviendrait à comparer un nombre qui n'en est pas un.
   */
  async execute(command: CreateTvaRegimeCommand): Promise<string> {
    const { payload } = command;
    const regime = TvaRegime.open({
      id: this.ids.next(),
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
    });
    await ensureRateFree(this.regimes, regime.percent, null);
    await this.regimes.add(regime);
    // Pas de portée : un régime qui naît ne vise encore aucune famille.
    await this.journal.record({
      type: PIM_EVENTS.tvaRegimeCreated,
      subjectType: "tva_regime",
      subjectId: regime.id,
      payload: { name: payload.name, percent: payload.percent },
    });
    return regime.id;
  }
}
