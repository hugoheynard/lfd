import type { BatchShortcutsSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SellableArticlesReader } from "../../channels/commerce/sellable-articles.reader.js";
import { BatchShortcutReader } from "../../domain/ports/batch-shortcut.reader.js";
import { GetBatchShortcutsSettingsQuery } from "./get-batch-shortcuts-settings.query.js";

/**
 * La page des raccourcis (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1) : les articles vendables, demandés au commerce par le canal, et les
 * raccourcis vivants. Les deux se lisent ensemble ; un raccourci dont
 * l'article n'est plus vendu reste servi — l'écran ne le montre pas, la fiche
 * d'atelier le garde. Lecture pure.
 */
@QueryHandler(GetBatchShortcutsSettingsQuery)
export class GetBatchShortcutsSettingsHandler implements IQueryHandler<
  GetBatchShortcutsSettingsQuery,
  BatchShortcutsSettingsView
> {
  constructor(
    private readonly shortcuts: BatchShortcutReader,
    private readonly articles: SellableArticlesReader,
  ) {}

  async execute(): Promise<BatchShortcutsSettingsView> {
    const [articles, shortcuts] = await Promise.all([
      this.articles.sellableArticles(),
      this.shortcuts.live(),
    ]);
    return {
      articles: articles.map((article) => ({ ...article })),
      shortcuts: shortcuts.map((shortcut) => ({ ...shortcut })),
    };
  }
}
