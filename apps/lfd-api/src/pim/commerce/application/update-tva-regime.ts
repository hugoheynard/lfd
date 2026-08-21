import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";
import type { TvaRegimePayload } from "./create-tva-regime.js";
import { ensureTagFree, requireRegime } from "./tva-support.js";

export class UpdateTvaRegimeCommand {
  constructor(
    readonly id: string,
    readonly payload: TvaRegimePayload,
  ) {}
}

@CommandHandler(UpdateTvaRegimeCommand)
export class UpdateTvaRegimeHandler implements ICommandHandler<UpdateTvaRegimeCommand, void> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  async execute(command: UpdateTvaRegimeCommand): Promise<void> {
    const regime = await requireRegime(this.regimes, command.id);
    const { payload } = command;
    regime.revise(payload.name, payload.description ?? "", payload.percent);
    await ensureTagFree(this.regimes, regime.tag, regime.id);
    await this.regimes.save(regime);
  }
}
