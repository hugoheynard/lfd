import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { EmplacementRepository } from '../domain/ports/emplacement.repository.js';
import { requireEmplacement } from './emplacement-support.js';

export class DeleteEmplacementCommand {
  constructor(readonly id: string) {}
}

@CommandHandler(DeleteEmplacementCommand)
export class DeleteEmplacementHandler implements ICommandHandler<
  DeleteEmplacementCommand,
  void
> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  async execute(command: DeleteEmplacementCommand): Promise<void> {
    await requireEmplacement(this.emplacements, command.id);
    await this.emplacements.remove(command.id);
  }
}
