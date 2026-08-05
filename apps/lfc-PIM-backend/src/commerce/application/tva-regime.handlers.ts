import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  type ICommandHandler,
  type IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import {
  TvaRegimeNotFoundError,
  TvaTagConflictError,
} from '../domain/errors/commerce-errors.js';
import {
  TvaRegimeRepository,
  type TvaRegimeRecord,
} from '../domain/ports/tva-regime.repository.js';
import {
  CreateTvaRegimeCommand,
  RemoveTvaRegimeCommand,
  UpdateTvaRegimeCommand,
} from './tva-regime.commands.js';
import { ListTvaRegimesQuery } from './tva-regime.query.js';

/** Handle Shopify dérivé du taux : `5.5` → `tva-5-5`, `10` → `tva-10`. */
export function tagFor(percent: number): string {
  return `tva-${String(percent).replace('.', '-')}`;
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

@CommandHandler(UpdateTvaRegimeCommand)
export class UpdateTvaRegimeHandler implements ICommandHandler<
  UpdateTvaRegimeCommand,
  void
> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  async execute(command: UpdateTvaRegimeCommand): Promise<void> {
    await requireRegime(this.regimes, command.id);
    const { payload } = command;
    const tag = tagFor(payload.percent);
    await ensureTagFree(this.regimes, tag, command.id);

    await this.regimes.update(command.id, {
      name: payload.name,
      description: payload.description ?? '',
      percent: payload.percent,
      tag,
    });
  }
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

@QueryHandler(ListTvaRegimesQuery)
export class ListTvaRegimesHandler implements IQueryHandler<
  ListTvaRegimesQuery,
  TvaRegimeRecord[]
> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  execute(): Promise<TvaRegimeRecord[]> {
    return this.regimes.listAll();
  }
}

/** Refuse un `tag` déjà porté par un **autre** régime (même taux ⇒ même handle). */
async function ensureTagFree(
  regimes: TvaRegimeRepository,
  tag: string,
  exceptId: string | null,
): Promise<void> {
  const existing = await regimes.findByTag(tag);
  if (existing !== null && existing.id !== exceptId) {
    throw new TvaTagConflictError(tag);
  }
}

async function requireRegime(
  regimes: TvaRegimeRepository,
  id: string,
): Promise<TvaRegimeRecord> {
  const regime = await regimes.findById(id);
  if (regime === null) {
    throw new TvaRegimeNotFoundError(id);
  }
  return regime;
}
