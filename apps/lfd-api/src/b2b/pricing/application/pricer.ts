import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../platform/time/clock.js";
import { UnknownSkuError } from "../../orders/domain/errors/order-errors.js";
import { ProductCatalogReader } from "../../orders/domain/ports/product-catalog.reader.js";
import type { PricedArticle, PricedItem } from "../domain/loaded-pricer.js";
import { DuplicateArticleError } from "../domain/pricing-errors.js";
import { PricingMaterialsLoader } from "./pricing-materials.loader.js";

export type { PricedArticle, PricedItem };

/**
 * **Ce qu'on demande au `Pricer`** — un article, un client, une quantité.
 *
 * Trois champs, dont deux obligatoires. Tout le reste — quel étage s'applique,
 * quel palier s'ouvre, quel plancher relève — est une réponse, pas une entrée.
 */
export interface PriceRequest {
  readonly sku: string;
  /** `null` = un visiteur sans société : le tarif public, et aucune mercuriale lue. */
  readonly companyId: string | null;
  /**
   * 🔴 **Obligatoire.**
   *
   * « Le prix » n'existe pas sans quantité dès qu'un barème ou une mercuriale à
   * paliers est posé. Un défaut à `1` fabriquerait un chiffre plausible et faux
   * — exactement la famille de défaut qui a produit les deux divergences
   * connues. Une vitrine écrit `quantity: 1`, et cette ligne **dit ce qu'elle
   * fait**.
   */
  readonly quantity: number;
  /**
   * L'instant de résolution. **Absent, c'est l'horloge injectée.**
   *
   * Le renseigner sert les lectures datées — « que payait-il le 3 mars ? ». Le
   * choix est résolu **ici**, explicitement, et jamais par une valeur par défaut
   * dans une signature : le dépôt a déjà payé `floorViewFromRow(now = new
   * Date())`, dont le JSDoc dit « le pire des trois — un appelant qui l'oublie
   * ne reçoit pas une erreur, il reçoit une réponse plausible ». La valeur vient
   * ici d'un port et non du mur ; la ressemblance de forme suffisait à écarter
   * le défaut de paramètre.
   */
  readonly at?: Date | undefined;
}

/** Plusieurs articles, **un seul chargement**. */
export interface PriceListRequest {
  /** Dans l'ordre où ils seront rendus. Un SKU en double est refusé. */
  readonly articles: readonly { readonly sku: string; readonly quantity: number }[];
  readonly companyId: string | null;
  readonly at?: Date | undefined;
}

/**
 * **La porte d'entrée du prix.**
 *
 * ## Ce qu'elle remplace
 *
 * Pour obtenir UN prix, un consommateur écrivait une vingtaine de lignes : cinq
 * ports, trois fonctions de domaine, un ordre à connaître, deux signatures de
 * chargement différentes. Ce n'était pas une gêne esthétique — c'est la cause
 * des **deux divergences connues**. Chacun des cinq appelants avait réécrit
 * cette séquence à la main, et deux s'étaient trompés : l'écran de tarification
 * avait oublié les barèmes (1,83924 € contre 1,65532 € à la caisse), la
 * projection avait oublié la mercuriale (une courbe au tarif catalogue pour un
 * client qui en avait un).
 *
 * ## Trois objets, un seul chemin
 *
 * - `Pricer` — **cet objet** : la porte pour qui n'a rien en main. Il résout le
 *   catalogue, demande les matériaux, rend des prix.
 * - `PricingMaterialsLoader` — la **seule** séquence de chargement du dépôt.
 * - `LoadedPricer` — le tarificateur pur, **seul appelant de `resolvePrice`**,
 *   et c'est `lint:price-pipeline` qui le tient.
 *
 * Un appelant qui charge déjà en lot — la caisse, l'écran de tarification —
 * s'adresse au `LoadedPricer` directement : lui faire repasser par ici lui
 * ferait relire ce qu'il a déjà lu. Ce qu'il ne peut plus faire, c'est écrire sa
 * propre recette.
 *
 * ## Ce qu'elle ne fait pas
 *
 * Elle ne compose pas un **panier** — acheminement, TVA, totaux appartiennent à
 * `OrderLinePricing`, et un panier n'est pas une somme de prix d'articles. Elle
 * n'écrit rien : le chemin qui facture ne doit pas pouvoir poser un tarif, et
 * c'est déjà la règle des ports.
 */
@Injectable()
export class Pricer {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly materials: PricingMaterialsLoader,
    private readonly clock: Clock,
  ) {}

  /**
   * **Le prix d'un article**, pour un client, à un instant.
   *
   * @throws {UnknownSkuError} le catalogue ne connaît pas ce SKU. Un refus, et
   * non un `null` : un écran qui reçoit `null` affiche un vide, et un vide se
   * lit « gratuit » ou « indisponible » selon qui regarde.
   */
  async for(request: PriceRequest): Promise<PricedArticle> {
    const [only] = await this.forAll({
      articles: [{ sku: request.sku, quantity: request.quantity }],
      companyId: request.companyId,
      at: request.at,
    });
    // `forAll` rend autant d'articles qu'on en demande, ou lève : un SKU inconnu
    // ne raccourcit pas la liste. L'absence est donc impossible, et la garde est
    // là pour le type, pas pour un cas.
    if (only === undefined) {
      throw new UnresolvedArticleError(request.sku);
    }
    return only;
  }

  /**
   * **Le prix de plusieurs articles, en un seul chargement.**
   *
   * 🔴 C'est la méthode qui empêche la façade de devenir le problème. Appeler
   * `for` dans une boucle réintroduirait exactement le N+1 que `materialsOf`
   * existe pour empêcher : vingt articles, vingt chargements — le JSDoc de
   * `materialsOf` raconte les soixante requêtes que ça coûtait avant lui.
   *
   * **Ordre et complétude.** Le tableau rendu suit celui demandé, et un SKU
   * inconnu fait échouer l'appel **entier** plutôt que de raccourcir la liste :
   * une liste plus courte que demandée est un écran qui ment par omission, et
   * personne ne compte les lignes.
   *
   * @throws {DuplicateArticleError} le même SKU demandé deux fois.
   * @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas.
   */
  async forAll(request: PriceListRequest): Promise<readonly PricedArticle[]> {
    const seen = new Set<string>();
    for (const article of request.articles) {
      if (seen.has(article.sku)) {
        throw new DuplicateArticleError(article.sku);
      }
      seen.add(article.sku);
    }
    if (request.articles.length === 0) {
      return [];
    }

    // L'instant est résolu ICI, une fois, et le même pour tous les articles :
    // deux résolutions à quelques millisecondes d'écart pourraient sinon tomber
    // de part et d'autre du basculement d'une promotion.
    const at = request.at ?? this.clock.now();

    // Le catalogue en un lot, et AVANT les matériaux : un SKU inconnu doit être
    // refusé sans qu'on ait payé les lectures d'une demande qu'on va rejeter.
    const catalogue = await this.catalog.resolveMany(request.articles.map(({ sku }) => sku));
    const items = request.articles.map(({ sku, quantity }) => {
      const found = catalogue.get(sku);
      if (found === undefined) {
        throw new UnknownSkuError(sku);
      }
      const item: PricedItem = {
        sku: found.sku,
        name: found.name,
        category: found.category,
        canonicalMillicents: found.unitPriceMillicents,
      };
      return { item, quantity };
    });

    const pricer = await this.materials.pricerFor(items, { companyId: request.companyId }, at);
    if (pricer === null) {
      throw new UnresolvedArticleError(items[0]?.item.sku ?? "");
    }
    return pricer.priceAll(items);
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
