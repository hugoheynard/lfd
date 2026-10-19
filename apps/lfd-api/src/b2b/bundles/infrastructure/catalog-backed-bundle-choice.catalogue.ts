import { Injectable } from "@nestjs/common";

import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
import type { BundleChoiceArticle } from "../domain/ports/bundle-choice-article.js";
import { BundleChoiceCatalogue } from "../domain/ports/bundle-choice.catalogue.js";
import { catalogBundleArticles } from "./catalog-bundle-articles.js";

/** Le jugement des articles d'une formule, par les ports du catalogue. */
@Injectable()
export class CatalogBackedBundleChoiceCatalogue extends BundleChoiceCatalogue {
  constructor(
    private readonly admin: CatalogAdminReader,
    private readonly catalog: CatalogReader,
  ) {
    super();
  }

  async articlesAmong(skus: readonly string[]): Promise<ReadonlyMap<string, BundleChoiceArticle>> {
    if (skus.length === 0) {
      return new Map();
    }
    const wanted = new Set(skus);
    const articles = await catalogBundleArticles(this.admin, this.catalog);
    return new Map(
      articles
        .filter((article) => wanted.has(article.sku))
        .map((article) => [article.sku, article]),
    );
  }
}
