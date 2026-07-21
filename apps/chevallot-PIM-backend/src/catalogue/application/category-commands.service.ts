import { Inject, Injectable } from '@nestjs/common';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import {
  CategoryCycleError,
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

export interface CreateCategoryInput {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly parentId?: string | undefined;
}

export interface RenameCategoryInput {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
}

/**
 * Les verbes du catalogue côté familles — un par intention (règle **R2**).
 *
 * Il n'existe pas d'`updateCategory(partial)` : une mutation anonyme n'a pas de fait
 * correspondant, et ne pourrait pas être rétro-nommée le jour où l'event store arrive.
 */
@Injectable()
export class CategoryCommands {
  constructor(
    private readonly categories: CategoryRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async create(input: CreateCategoryInput): Promise<string> {
    const name = localizedText('nom', input.nameFr, input.nameEn);
    const parentId = input.parentId ?? null;

    if (parentId !== null) {
      await this.requireCategory(parentId);
    }

    const id = this.ids.next();
    await this.categories.insert({
      id,
      name,
      slug: this.slugOf(name),
      parentId,
      position: await this.categories.nextPosition(parentId),
    });

    return id;
  }

  async rename(id: string, input: RenameCategoryInput): Promise<void> {
    await this.requireCategory(id);
    const name = localizedText('nom', input.nameFr, input.nameEn);
    await this.categories.rename(id, name, this.slugOf(name));
  }

  /** Invariant 5 : archiver une famille qui porte des produits actifs est refusé. */
  async archive(id: string): Promise<void> {
    await this.requireCategory(id);

    if ((await this.categories.countActiveProducts(id)) > 0) {
      throw new CategoryHasActiveProductsError(id);
    }

    await this.categories.archive(id);
  }

  private slugOf(name: LocalizedText): LocalizedText {
    return name.en === undefined
      ? { fr: slugify(name.fr) }
      : { fr: slugify(name.fr), en: slugify(name.en) };
  }

  private async requireCategory(id: string): Promise<CategoryRecord> {
    const category = await this.categories.findById(id);
    if (category === null) {
      throw new CategoryNotFoundError(id);
    }
    return category;
  }
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

export { CategoryCycleError };
