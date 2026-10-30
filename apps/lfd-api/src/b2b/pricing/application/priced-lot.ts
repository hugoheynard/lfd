import type { VolumeTierPriceView } from "@lfd/contracts";

import type { CatalogArticle } from "../../catalog/domain/catalogue-article.js";
import { AppError, TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { LoadedPricer, PricedArticle } from "../domain/loaded-pricer.js";
import type { PromotionShadowJournal } from "../../promotions/domain/ports/promotion-shadow.journal.js";

/** Le tarificateur des promotions sous l'ombre, et où consigner ce qu'il dit autrement. */
export interface ShadowPricer {
  readonly pricer: LoadedPricer;
  readonly journal: PromotionShadowJournal;
}

/**
 * **Un lot d'articles chargé, et tout ce qu'on peut lui demander.**
 *
 * ## Ce qu'il remplace
 *
 * Quatre appelants demandaient un `LoadedPricer` au chargeur, puis lui
 * repassaient l'article à chaque question. L'article voyageait donc **deux
 * fois** : une fois pour charger les matériaux, une fois pour tarifer — et rien
 * n'exigeait que ce soit le même. Un appelant pouvait charger sur un article et
 * tarifer sur un autre, sans qu'une ligne rougisse.
 *
 * Ici le lot **connaît ses articles**. On lui parle par SKU, et un SKU qu'il n'a
 * pas chargé est refusé plutôt que tarifé sur des matériaux qui ne le visent
 * pas.
 *
 * ## Ce qu'il n'est pas
 *
 * Ce n'est pas un panier : acheminement, TVA et totaux appartiennent à
 * `OrderLinePricing`, et une somme de prix d'articles n'est pas une commande.
 *
 * Ce n'est pas non plus un cache : il vaut pour **un** instant et **un** client,
 * ceux qu'on lui a donnés en le chargeant. Le garder d'une requête à l'autre
 * servirait le prix d'avant.
 */
export class PricedLot {
  private readonly articles: ReadonlyMap<string, CatalogArticle>;

  constructor(
    private readonly pricer: LoadedPricer,
    articles: readonly CatalogArticle[],
    /**
     * Le tarificateur des promotions sous la source `shadow` (plan des
     * promotions, § 13.5) — calculé à côté, jamais servi ; `null` sinon.
     */
    private readonly shadow: ShadowPricer | null = null,
  ) {
    this.articles = new Map(articles.map((article) => [article.sku, article]));
  }

  /**
   * **Le prix d'un article du lot, à une quantité.**
   *
   * @throws {ArticleNotInLotError} un SKU que ce lot n'a pas chargé.
   */
  price(sku: string, quantity: number): PricedArticle {
    const article = this.articleFor(sku);
    const served = this.pricer.price(article, quantity);
    const { shadow } = this;
    if (shadow !== null) {
      compareInShadow(shadow, served, () => shadow.pricer.price(article, quantity));
    }
    return served;
  }

  /**
   * Plusieurs articles, chacun à **sa** quantité, dans l'ordre demandé.
   *
   * @throws {ArticleNotInLotError} un SKU que ce lot n'a pas chargé.
   */
  all(
    lines: readonly { readonly sku: string; readonly quantity: number }[],
  ): readonly PricedArticle[] {
    return lines.map((line) => this.price(line.sku, line.quantity));
  }

  /**
   * **Ce que le barème donne, palier par palier** — la grille lue au téléphone.
   *
   * `null` quand aucun seuil n'existe : une grille à une ligne dirait que le
   * prix dépend de la quantité alors qu'il n'en dépend pas.
   *
   * @throws {ArticleNotInLotError} un SKU que ce lot n'a pas chargé.
   */
  tiers(sku: string, quantity: number): readonly VolumeTierPriceView[] | null {
    return this.pricer.tiers(this.articleFor(sku), quantity);
  }

  /**
   * **Le prix « si le cumul valait N »** — la question de la projection.
   *
   * Elle n'est pas celle de {@link price} : aucune preuve n'y est recevable,
   * puisque `N` est une hypothèse et non une commande.
   *
   * @throws {ArticleNotInLotError} un SKU que ce lot n'a pas chargé.
   */
  projectAt(sku: string, cumulative: number): PricedArticle {
    return this.pricer.priceAtCumulative(this.articleFor(sku), cumulative);
  }

  private articleFor(sku: string): CatalogArticle {
    const article = this.articles.get(sku);
    if (article === undefined) {
      throw new ArticleNotInLotError(sku, [...this.articles.keys()]);
    }
    return article;
  }
}

/**
 * On demande le prix d'un article que le lot n'a pas chargé.
 *
 * **Technique et non métier** : ce n'est pas le client qui s'est trompé, c'est
 * l'appelant qui demande un prix sur des matériaux qui ne visent pas cet
 * article. Le lui rendre quand même donnerait un chiffre plausible — une
 * promotion de famille manquée, un plancher qui ne s'applique pas — et
 * personne ne s'en apercevrait avant la facture.
 *
 * Le message nomme ce qui a été chargé : sur un lot de quatre-vingt-douze
 * articles, « lequel manque » est la seule question qu'on se pose.
 */
export class ArticleNotInLotError extends TechnicalError {
  constructor(
    readonly sku: string,
    readonly loaded: readonly string[],
  ) {
    super(
      "pricing.lot.article_absent",
      `L'article « ${sku} » n'est pas dans ce lot : il n'a pas été chargé, donc les ` +
        `matériaux en main ne le visent pas (${String(loaded.length)} article(s) chargé(s)).`,
    );
  }
}

/**
 * On demande un lot **sans article**.
 *
 * Technique : charger des matériaux pour zéro article ne coûte pas seulement
 * quatre lectures pour rien, ça rend un tarificateur auquel on ne peut poser
 * aucune question. L'appelant qui peut avoir un panier vide le teste **avant**
 * de charger — c'est ce que fait la vitrine, qui sert alors son catalogue au
 * tarif.
 */
export class EmptyLotError extends TechnicalError {
  constructor() {
    super(
      "pricing.lot.empty",
      "Un lot de prix sans article : il n'y a rien à charger, et rien à demander ensuite.",
    );
  }
}

/**
 * **L'ombre** : le prix des promotions, comparé au prix servi au centime et
 * par la règle de l'étage `promotion` ; tout écart est consigné, et le prix
 * servi ne change pas. Un échec du nouveau chemin est consigné aussi — jamais
 * propagé : l'ombre ne fait pas tomber un panier que l'ancien chemin chiffre.
 */
function compareInShadow(
  shadow: ShadowPricer,
  served: PricedArticle,
  priceInShadow: () => PricedArticle,
): void {
  let fresh: PricedArticle;
  try {
    fresh = priceInShadow();
  } catch (error) {
    shadow.journal.divergence({
      point: "failure",
      code: error instanceof AppError ? error.code : "unexpected",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const servedRuleId = promotionStepOf(served);
  const shadowRuleId = promotionStepOf(fresh);
  if (fresh.finalMillicents !== served.finalMillicents || servedRuleId !== shadowRuleId) {
    shadow.journal.divergence({
      point: "line",
      sku: served.sku,
      quantity: served.quantity,
      servedMillicents: served.finalMillicents,
      shadowMillicents: fresh.finalMillicents,
      servedRuleId,
      shadowRuleId,
    });
  }
}

/** La règle (ou la promotion) qui a agi à l'étage `promotion`, ou `null`. */
function promotionStepOf(article: PricedArticle): string | null {
  return article.steps.find((step) => step.stage === "promotion")?.ruleId ?? null;
}
