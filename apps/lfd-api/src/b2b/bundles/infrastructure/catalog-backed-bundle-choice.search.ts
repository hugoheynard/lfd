import { Injectable } from "@nestjs/common";

import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
import type { BundleChoiceArticle } from "../domain/ports/bundle-choice-article.js";
import { BundleChoiceSearch } from "../domain/ports/bundle-choice.search.js";
import { catalogBundleArticles } from "./catalog-bundle-articles.js";

const DIACRITICS = /\p{Diacritic}/gu;

/** Casse et accents ignorés : « cafe » trouve « Café ». */
function folded(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/**
 * La recherche de l'éditeur, par les ports du catalogue. Filtrée en mémoire :
 * le catalogue compte quelques centaines d'articles, et c'est un écran du
 * back-office.
 */
@Injectable()
export class CatalogBackedBundleChoiceSearch extends BundleChoiceSearch {
  constructor(
    private readonly admin: CatalogAdminReader,
    private readonly catalog: CatalogReader,
  ) {
    super();
  }

  async search(term: string, limit: number): Promise<readonly BundleChoiceArticle[]> {
    const needle = folded(term.trim());
    const articles = await catalogBundleArticles(this.admin, this.catalog);
    return articles
      .filter((article) => article.verdict === "admissible")
      .filter(
        (article) =>
          needle === "" ||
          folded(article.name).includes(needle) ||
          folded(article.sku).includes(needle),
      )
      .slice(0, limit);
  }
}
