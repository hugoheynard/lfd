import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
import { servedTo } from "../../catalog/domain/served-to.js";
import type {
  BundleChoiceArticle,
  BundleChoiceVerdict,
} from "../domain/ports/bundle-choice-article.js";

/** Ce qu'il faut d'une ligne du paramétrage pour juger un article. */
type AdminLine = Awaited<ReturnType<CatalogAdminReader["list"]>>[number];

/**
 * **Le catalogue du commerce, vu par les formules** — lu par les ports que le
 * catalogue publie déjà, jamais par ses tables (`lint:withdrawn-filter` les
 * réserve à `catalog/`).
 *
 * - le paramétrage (`CatalogAdminReader`) rend TOUT ce qui est en vente,
 *   masqués compris : c'est lui qui dit qu'un article existe, et il porte ce
 *   que `servedTo` lit et le drapeau `operationOnly` ;
 * - la boutique publique (`CatalogReader.listSellable("public")`) rend les
 *   vignettes — elle seule les porte.
 *
 * Le verdict est celui de `servedTo(item, "public")`, la règle unique du
 * masquage (§4.2 du plan) : une seconde écriture de la règle ici finirait par
 * vendre en formule ce que la boutique cache.
 */
export async function catalogBundleArticles(
  admin: CatalogAdminReader,
  catalog: CatalogReader,
): Promise<readonly BundleChoiceArticle[]> {
  const [lines, sellable] = await Promise.all([admin.list(), catalog.listSellable("public")]);
  const thumbnails = new Map(
    sellable.map((item) => [item.sku, (item.thumbnail ?? item.image)?.url ?? null]),
  );
  return lines.map((line) => ({
    sku: line.sku,
    name: line.name,
    shelf: line.categoryName,
    thumbnailUrl: thumbnails.get(line.sku) ?? null,
    verdict: verdictOf(line),
  }));
}

function verdictOf(line: AdminLine): BundleChoiceVerdict {
  if (!servedTo(line, "public")) {
    return "not_served_to_public";
  }
  return line.operationOnly ? "operation_only" : "admissible";
}
