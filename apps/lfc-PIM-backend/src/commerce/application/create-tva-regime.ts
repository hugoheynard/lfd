import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import { TvaRegimeRepository } from '../domain/ports/tva-regime.repository.js';
import { ensureTagFree, tagFor } from './tva-support.js';

export interface TvaRegimePayload {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

export class CreateTvaRegimeCommand {
  constructor(readonly payload: TvaRegimePayload) {}
}

@CommandHandler(CreateTvaRegimeCommand)
export class CreateTvaRegimeHandler implements ICommandHandler<
  CreateTvaRegimeCommand,
  string
> {
  constructor(
    private readonly regimes: TvaRegimeRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateTvaRegimeCommand): Promise<string> {
    const { payload } = command;
    const tag = tagFor(payload.percent);
    await ensureTagFree(this.regimes, tag, null);

    const id = this.ids.next();
    await this.regimes.insert({
      id,
      name: payload.name,
      description: payload.description ?? '',
      percent: payload.percent,
      tag,
    });
    return id;
  }
}
