import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  type ICommandHandler,
  type IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import {
  CategoryHasActiveProductsError,
  CategoryNotFoundError,
} from '../domain/errors/catalogue-errors.js';
import {
  CategoryRepository,
  type CategoryRecord,
} from '../domain/ports/category.repository.js';
import {
  localizedText,
  slugify,
  type LocalizedText,
} from '../domain/value-objects/localized-text.js';
import {
  ArchiveCategoryCommand,
  CreateCategoryCommand,
  RenameCategoryCommand,
} from './category.commands.js';
import { ListCategoriesQuery } from './category.query.js';

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

@CommandHandler(RenameCategoryCommand)
export class RenameCategoryHandler implements ICommandHandler<
  RenameCategoryCommand,
  void
> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: RenameCategoryCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    const name = localizedText(
      'nom',
      command.payload.nameFr,
      command.payload.nameEn,
    );
    await this.categories.rename(command.id, name, slugOf(name));
  }
}

@CommandHandler(ArchiveCategoryCommand)
export class ArchiveCategoryHandler implements ICommandHandler<
  ArchiveCategoryCommand,
  void
> {
  constructor(private readonly categories: CategoryRepository) {}

  /** Invariant 5 : archiver une famille qui porte des produits actifs est refusé. */
  async execute(command: ArchiveCategoryCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    if ((await this.categories.countActiveProducts(command.id)) > 0) {
      throw new CategoryHasActiveProductsError(command.id);
    }
    await this.categories.archive(command.id);
  }
}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<
  ListCategoriesQuery,
  CategoryRecord[]
> {
  constructor(private readonly categories: CategoryRepository) {}

  execute(): Promise<CategoryRecord[]> {
    return this.categories.listAll();
  }
}

function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}

async function requireCategory(
  categories: CategoryRepository,
  id: string,
): Promise<CategoryRecord> {
  const category = await categories.findById(id);
  if (category === null) {
    throw new CategoryNotFoundError(id);
  }
  return category;
}

/** Réservé au déplacement de famille (verbe `MoveCategory`), pas encore exposé. */
export function wouldCreateCycle(
  categories: readonly CategoryRecord[],
  movedId: string,
  targetParentId: string,
): boolean {
  let cursor: string | null = targetParentId;
  while (cursor !== null) {
    if (cursor === movedId) {
      return true;
    }
    const parent: CategoryRecord | undefined = categories.find(
      (candidate) => candidate.id === cursor,
    );
    cursor = parent?.parentId ?? null;
  }
  return false;
}
