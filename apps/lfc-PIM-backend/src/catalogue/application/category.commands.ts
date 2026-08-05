/**
 * Commandes des **familles** — une classe par intention (règle R2), dispatchées par
 * le `CommandBus`. Pas d'`updateCategory(partial)` : une mutation anonyme n'a pas de
 * fait correspondant.
 */
export interface CreateCategoryPayload {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly parentId?: string | undefined;
}

export interface RenameCategoryPayload {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
}

export class CreateCategoryCommand {
  constructor(readonly payload: CreateCategoryPayload) {}
}

export class RenameCategoryCommand {
  constructor(
    readonly id: string,
    readonly payload: RenameCategoryPayload,
  ) {}
}

export class ArchiveCategoryCommand {
  constructor(readonly id: string) {}
}
