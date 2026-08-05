import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { TvaRegimeRepository } from '../domain/ports/tva-regime.repository.js';
import { requireRegime } from './tva-support.js';

export class RemoveTvaRegimeCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(RemoveTvaRegimeCommand)
export class RemoveTvaRegimeHandler implements ICommandHandler<
  RemoveTvaRegimeCommand,
  void
> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  async execute(command: RemoveTvaRegimeCommand): Promise<void> {
    await requireRegime(this.regimes, command.id);
    await this.regimes.remove(command.id);
  }
}
