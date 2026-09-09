import { Injectable } from "@nestjs/common";

import { DomainError, TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../platform/time/clock.js";
import { epochOf, readsArchived, type PriceEpoch } from "../domain/price-epoch.js";
import { DuplicateArticleError } from "../domain/pricing-errors.js";
import { atCanonicalPrice, type CatalogArticle } from "../../catalog/domain/catalogue-article.js";
import { CanonicalPriceHistoryReader } from "../../catalog/domain/ports/canonical-price-history.reader.js";
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
    private readonly history: CanonicalPriceHistoryReader,
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
    const now = this.clock.now();
    const at = request.at ?? now;
    // 🔴 **L'époque se décide ICI, et nulle part ailleurs.** C'est le seul
    // endroit du chemin qui tient à la fois l'instant demandé et l'horloge : le
    // chargeur ne l'a pas, les lecteurs non plus. Leur faire descendre le
    // `Clock` pour qu'ils recalculent chacun la même comparaison, ce serait cinq
    // encodages d'une seule décision — l'éparpillement par lequel R15 s'est
    // glissé. Cf. `price-epoch.ts`.
    const epoch = epochOf(at, now);
    const items = await this.sealedAt(request.articles, at, epoch);
    const pricer = await this.materials.pricerFor(
      items,
      { companyId: request.companyId },
      at,
      request.lens ?? "measured",
      epoch,
    );
    if (pricer === null) {
      throw new UnresolvedArticleError(items[0]?.item.sku ?? "");
    }
    return new PricedLot(
      pricer,
      items.map(({ item }) => item),
    );
  }

  /**
   * **Les articles scellés au tarif de l'INSTANT demandé.**
   *
   * Au présent, rien à faire : l'appelant a lu son catalogue, et son sceau porte
   * le prix du jour — qui est le bon.
   *
   * Sur une **relecture**, non. Le sceau porte encore le prix d'aujourd'hui,
   * alors que toutes les décisions viennent d'être lues à leur date : le lot
   * combinerait les règles d'alors avec le tarif d'entrée du jour. C'est la
   * dernière entrée d'une reconstitution datée qui restait fausse, et la faute
   * ne se voit pas — elle rend un prix **plausible**.
   *
   * 🔴 **Un article sans trace à cette date est REFUSÉ**, jamais scellé au prix
   * du jour. C'est la doctrine que porte déjà `CanonicalPriceHistoryReader` :
   * « rendre le prix d'aujourd'hui à sa place serait exactement le mensonge que
   * cet historique existe pour supprimer ». Le refus nomme l'article et le
   * premier instant que l'histoire couvre — sans quoi on ne saurait pas si le
   * produit n'existait pas encore ou si l'historique ne remonte pas si loin.
   */
  private async sealedAt(
    articles: readonly { readonly article: CatalogArticle; readonly quantity: number }[],
    at: Date,
    epoch: PriceEpoch,
  ): Promise<{ readonly item: CatalogArticle; readonly quantity: number }[]> {
    if (!readsArchived(epoch)) {
      return articles.map(({ article, quantity }) => ({ item: article, quantity }));
    }
    const [pricing, startsAt] = await Promise.all([
      this.history.pricingAt(at),
      this.history.startsAt(),
    ]);
    return articles.map(({ article, quantity }) => {
      const past = pricing.get(article.sku);
      if (past === undefined) {
        throw new NoCanonicalPriceAtError(article.sku, at, startsAt);
      }
      return {
        item: atCanonicalPrice(
          {
            sku: article.sku,
            name: article.name,
            category: article.category,
            unitPriceMillicents: article.canonicalMillicents,
          },
          past.unitPriceMillicents,
        ).article,
        quantity,
      };
    });
  }
}

/**
 * **L'historique ne connaît pas le tarif de cet article à cette date.**
 *
 * Un `DomainError` — 400 — et non une erreur technique : la demande est
 * recevable, c'est la question qui ne peut pas être honorée. Rendre le prix
 * d'aujourd'hui à la place aurait produit un chiffre plausible mêlant les
 * décisions d'alors au tarif du jour.
 *
 * Le message distingue les deux causes, parce qu'elles n'appellent pas le même
 * geste : un produit qui n'existait pas encore, ou une histoire qui ne remonte
 * pas si loin.
 */
export class NoCanonicalPriceAtError extends DomainError {
  constructor(
    readonly sku: string,
    readonly at: Date,
    readonly historyStartsAt: Date | null,
  ) {
    super(
      "pricing.canonical.unknown_at",
      `Le tarif de « ${sku} » au ${at.toISOString().slice(0, 10)} est inconnu : ` +
        (historyStartsAt === null || historyStartsAt.getTime() > at.getTime()
          ? `l'historique des tarifs ne commence que le ${
              historyStartsAt === null ? "…" : historyStartsAt.toISOString().slice(0, 10)
            }.`
          : `cet article n'était pas encore au catalogue.`),
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
