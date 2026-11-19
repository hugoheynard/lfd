import type { ResupplyTemplateView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { ResupplyArticle } from "../domain/resupply-catalogue.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import type { ResupplyTemplateSnapshot } from "../domain/resupply-template.js";
import { templateLineIssueOf } from "../domain/resupply-template-applicability.js";
import { ResupplyTemplateReader } from "../domain/resupply-template.reader.js";
import { ListResupplyTemplatesQuery } from "./list-resupply-templates.query.js";

function viewOf(
  template: ResupplyTemplateSnapshot,
  articles: ReadonlyMap<string, ResupplyArticle>,
): ResupplyTemplateView {
  return {
    id: template.id,
    version: template.version,
    siteId: template.siteId,
    name: template.content.name,
    target: template.content.target,
    lines: template.content.lines.map((line) => {
      const article = articles.get(line.sku);
      return {
        sku: line.sku,
        quantity: line.quantity,
        saleUnit: line.saleUnit,
        articleName: article?.name ?? null,
        issue: templateLineIssueOf(line, article),
      };
    }),
    updatedByName: template.updated.author.name,
    updatedAt: template.updated.at.toISOString(),
  };
}

/**
 * La bibliothèque d'un point : ses modèles actifs, chaque ligne confrontée
 * au catalogue du réassort d'aujourd'hui (M6) — retirée ou d'une unité
 * changée, elle est marquée, jamais corrigée.
 */
@QueryHandler(ListResupplyTemplatesQuery)
export class ListResupplyTemplatesHandler implements IQueryHandler<
  ListResupplyTemplatesQuery,
  readonly ResupplyTemplateView[]
> {
  constructor(
    private readonly reader: ResupplyTemplateReader,
    private readonly catalogue: ResupplyCatalogue,
  ) {}

  async execute(query: ListResupplyTemplatesQuery): Promise<readonly ResupplyTemplateView[]> {
    const templates = await this.reader.listActive(query.siteId);
    if (templates.length === 0) {
      return [];
    }
    const articles = new Map((await this.catalogue.articles()).map((a) => [a.sku, a] as const));
    return templates.map((template) => viewOf(template, articles));
  }
}
