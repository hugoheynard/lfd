import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../platform/time/clock.js";
import { DuplicateArticleError } from "../domain/pricing-errors.js";
import type { CatalogArticle } from "../../catalog/domain/catalogue-article.js";
import type { PriceLens } from "../domain/price-lens.js";
import { EmptyLotError, PricedLot } from "./priced-lot.js";
import { PricingMaterialsLoader } from "./pricing-materials.loader.js";

export type { PricedArticle } from "../domain/loaded-pricer.js";

/**
 * **Un lot à charger** — la demande de la porte.
 *
 * Elle prend des **articles**, pas des SKU : la caisse, la vitrine et le tableau
 * ont déjà lu leur catalogue, et leur faire relire serait une lecture de plus sur
 * le chemin qui facture. Les articles sont **scellés** (`CatalogArticle`), donc
 * leur prix d'entrée vient du catalogue et non de l'appelant.
 */
export interface LotRequest {
  /** Dans l'ordre où ils seront rendus. Un SKU en double est refusé. */
  readonly articles: readonly { readonly article: CatalogArticle; readonly quantity: number }[];
  readonly companyId: string | null;
  /**
   * **Ce que cette question autorise à prouver** — cf. {@link PriceLens}.
   *
   * Par défaut `measured` : la question ordinaire est celle d'un client réel,
   * dont l'historique et l'engagement comptent. Une question qui ne prouve rien
   * le **dit**, plutôt que de le laisser deviner par la méthode appelée ensuite.
   */
  readonly lens?: PriceLens | undefined;
  readonly at?: Date | undefined;
}

/**
 * **LA porte du prix.**
 *
 * ## Ce qu'elle remplace
 *
 * Pour obtenir un prix, un consommateur écrivait une vingtaine de lignes : cinq
 * ports, trois fonctions de domaine, un ordre à connaître, deux signatures de
 * chargement différentes. Ce n'était pas une gêne esthétique — c'est la cause
 * des **deux divergences connues** : l'écran de tarification avait oublié les
 * barèmes (1,83924 € contre 1,65532 € à la caisse), la projection avait oublié
 * la mercuriale (une courbe au tarif catalogue pour un client qui en avait un).
 *
 * ## 🔴 Elle prend des ARTICLES, jamais des SKU
 *
 * C'est la décision qui rend cette porte empruntable, et elle a été prise en
 * corrigeant l'inverse. Une première version portait `for(sku)` / `forAll(skus)`
 * et résolvait le catalogue elle-même — d'où trois conséquences qui se tenaient
 * la main :
 *
 * - une **lecture en trop** pour tout appelant qui avait déjà lu son catalogue,
 *   c'est-à-dire tous ;
 * - un **droit de contourner**, écrit noir sur blanc dans son propre JSDoc
 *   (« un appelant qui charge déjà en lot s'adresse au `LoadedPricer` ») — et
 *   la vitrine l'a exercé ;
 * - un **cycle de modules** : la porte de `catalog` ne peut pas dépendre de
 *   `catalog`. `lint:import-cycles` l'a refusé le 2026-09-09, et c'est ce refus
 *   qui a fait retirer les deux méthodes. Elles n'avaient aucun appelant.
 *
 * Les articles sont **scellés** (`CatalogArticle`) : leur prix d'entrée vient du
 * catalogue, pas de l'appelant. Résoudre un SKU reste le travail de qui a un
 * SKU — le port est là pour ça, et il refuse ce qu'il ne connaît pas.
 *
 * ## Ce qu'elle ne fait pas
 *
 * Elle ne compose pas un **panier** — acheminement, TVA, totaux appartiennent à
 * `OrderLinePricing`, et un panier n'est pas une somme de prix d'articles. Elle
 * n'écrit rien : le chemin qui facture ne doit pas pouvoir poser un tarif.
 */
@Injectable()
export class Pricer {
  constructor(
    private readonly materials: PricingMaterialsLoader,
    private readonly clock: Clock,
  ) {}

  async load(request: LotRequest): Promise<PricedLot> {
    if (request.articles.length === 0) {
      throw new EmptyLotError();
    }
    const seen = new Set<string>();
    for (const { article } of request.articles) {
      if (seen.has(article.sku)) {
        throw new DuplicateArticleError(article.sku);
      }
      seen.add(article.sku);
    }

    // L'instant est résolu ICI, une fois, et le même pour tous les articles :
    // deux résolutions à quelques millisecondes d'écart pourraient sinon tomber
    // de part et d'autre du basculement d'une promotion.
    const at = request.at ?? this.clock.now();
    const items = request.articles.map(({ article, quantity }) => ({ item: article, quantity }));
    const pricer = await this.materials.pricerFor(
      items,
      { companyId: request.companyId },
      at,
      request.lens ?? "measured",
    );
    if (pricer === null) {
      throw new UnresolvedArticleError(items[0]?.item.sku ?? "");
    }
    return new PricedLot(
      pricer,
      request.articles.map(({ article }) => article),
    );
  }
}

/**
 * La résolution n'a rien rendu pour un article demandé.
 *
 * Inatteignable : le lot est non vide, et chaque SKU a été trouvé au catalogue
 * avant d'arriver ici. Écrite quand même, et en `TechnicalError`, parce que
 * l'alternative — un `??` qui fabrique un article vide — attribuerait un prix à
 * un article que personne n'a tarifé.
 */
class UnresolvedArticleError extends TechnicalError {
  constructor(readonly sku: string) {
    super(
      "pricing.request.unresolved",
      `Le prix de « ${sku} » n'a pas été rendu par la résolution.`,
    );
  }
}
