import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { TvaRegime } from "../domain/entities/tva-regime.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";
import { ensureTagFree } from "./tva-support.js";

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
  ) {}

  /**
   * L'agrégat naît d'abord — il valide le taux et en dérive le tag — et c'est
   * CE tag qu'on confronte aux autres. L'ordre compte : calculer le tag avant
   * de savoir le taux valide reviendrait à comparer une chaîne inventée.
   */
  async execute(command: CreateTvaRegimeCommand): Promise<string> {
    const { payload } = command;
    const regime = TvaRegime.open({
      id: this.ids.next(),
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
    });
    await ensureTagFree(this.regimes, regime.tag, null);
    await this.regimes.add(regime);
    return regime.id;
  }
}
