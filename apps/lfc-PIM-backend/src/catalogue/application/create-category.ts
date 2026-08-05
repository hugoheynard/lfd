import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import { CategoryRepository } from '../domain/ports/category.repository.js';
import { localizedText } from '../domain/value-objects/localized-text.js';
import { requireCategory, slugOf } from './category-support.js';

export interface CreateCategoryPayload {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly parentId?: string | undefined;
}

export class CreateCategoryCommand {
  constructor(readonly payload: CreateCategoryPayload) {}
}

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<
  CreateCategoryCommand,
  string
> {
  constructor(
    private readonly categories: CategoryRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateCategoryCommand): Promise<string> {
    const { payload } = command;
    const name = localizedText('nom', payload.nameFr, payload.nameEn);
    const parentId = payload.parentId ?? null;

    if (parentId !== null) {
      await requireCategory(this.categories, parentId);
    }

    const id = this.ids.next();
    await this.categories.insert({
      id,
      name,
      slug: slugOf(name),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });
    return id;
  }
}
