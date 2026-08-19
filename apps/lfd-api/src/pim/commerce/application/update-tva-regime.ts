import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";
import type { TvaRegimePayload } from "./create-tva-regime.js";
import { ensureTagFree, requireRegime, tagFor } from "./tva-support.js";

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
    await requireRegime(this.regimes, command.id);
    const { payload } = command;
    const tag = tagFor(payload.percent);
    await ensureTagFree(this.regimes, tag, command.id);

    await this.regimes.update(command.id, {
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
      tag,
    });
  }
}
