import type { ContentLocale, ShopCatalogueView, ShopItemView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Pricer } from "../../pricing/application/pricer.js";
import {
  sealingOfShelf,
  ShopCatalogueOffers,
  withFulfillmentOffers,
  type ShelfPrices,
  type ShelfBuyer,
  type ShelfBuyerKind,
} from "./shop-catalogue-offers.js";

export type { ShelfBuyerKind } from "./shop-catalogue-offers.js";

/** Un rayon calculé, et le principal actuel de sa société (actif ou non). */
export interface PricedShelf {
  readonly view: ShopCatalogueView;
  readonly principalId: string | null;
  /**
   * Le prochain instant où une opération datée change ce rayon d'elle-même,
   * ou `null` — l'échéance la plus tardive que le magasin peut lui donner
   * (`le-rayon-en-cache.md`, § 6).
   */
  readonly nextChangeAt: Date | null;
}

/** Une vitrine calculée, et le prochain instant d'opération qui la change. */
interface ComposedShelf {
  readonly view: ShopCatalogueView;
  readonly nextChangeAt: Date | null;
}
import { Clock } from "../../../platform/time/clock.js";
import { CatalogOperationsReader } from "../domain/ports/catalog-operations.reader.js";
import { nextOperationChange } from "../domain/next-operation-change.js";
import { CatalogPricePerKgReader } from "../domain/ports/catalog-price-per-kg.reader.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { CATALOG_SOURCE_LANGUAGE } from "../domain/catalog-translations.js";
import { ShopOrderCutoffsReader } from "../domain/ports/shop-order-cutoffs.reader.js";
import { withOrderLimits } from "./shop-catalogue-order-limits.js";
import { CatalogViewers } from "./catalog-viewers.service.js";
import { pricingCompanyOf, viewerAudience, type CatalogViewer } from "../domain/catalog-viewer.js";
import { shownVariantSkus, withPricesPerKg } from "./shop-catalogue-price-per-kg.js";
import { inShopLanguage, shopCatalogueOf, shownByShopSku } from "./shop-catalogue-view.js";
import { struck } from "./shop-catalogue-struck.js";
import { promotionNamesOf, withPromotionNames } from "./shop-catalogue-promotion-names.js";
import { SHELF_SCOPE, scopedTo, withoutCompany, type ShelfScope } from "./shop-catalogue-scope.js";
import type { PricingCaller } from "../../pricing/application/pricing-caller.js";

/**
 * **La vitrine à son prix — la même logique pour le visiteur et pour le client.**
 *
 * ## Ce qu'elle répare
 *
 * La vitrine servait le prix **canonique** du miroir, jamais résolu. Une
 * promotion publique — `audience: all`, « −10 % sur les viennoiseries » — était
 * donc **invisible au rayon** et n'apparaissait qu'au panier, où le devis la
 * résout. Le client voyait 2,00 €, payait 1,80 €, et l'écart était dans le bon
 * sens : personne ne réclamait. Mais **une promotion qu'on ne voit pas ne fait
 * pas vendre** — c'est un trou commercial, pas une divergence d'écran.
 *
 * ## Ce qui l'avait caché
 *
 * Une justification fausse, écrite dans le contrat : « elle est publique, donc
 * sans client ». Elle confond deux choses. Un prix **négocié** exige un client,
 * et la route publique ne peut effectivement pas le servir. Une **promotion
 * publique** n'en exige aucun : `matchesAudience` rend `true` pour
 * `audience: all` sans rien regarder.
 *
 * Le même raisonnement avait contaminé la route reconnue, qui court-circuitait
 * sur `companyId === null` en affirmant que « résoudre rendrait la même chose en
 * payant quatre requêtes pour rien ». Non : ça rendait la promotion.
 *
 * ## Pourquoi UN service et non deux chemins
 *
 * Les deux routes posent la même question et ne diffèrent que par un
 * `companyId`. Tant qu'elles avaient deux implémentations, l'une a oublié ce que
 * l'autre faisait — c'est l'histoire de tout ce contexte. Ici la seule variable
 * est l'argument.
 *
 * ## Pourquoi la porte, et plus le chargeur
 *
 * ⚠️ Ce paragraphe expliquait le contraire jusqu'au 2026-09-09 : la vitrine
 * **contournait** la façade, parce que celle-ci relisait le catalogue
 * (`resolveMany`) qu'on avait déjà en main — une lecture de plus sur la seule
 * route anonyme du dépôt. Le JSDoc de `Pricer` l'y autorisait explicitement.
 *
 * La façade ne relit plus rien : elle prend des **articles**. Le motif du
 * contournement a disparu, l'autorisation aussi, et `lint:price-door` interdit
 * désormais d'atteindre le chargeur depuis ici.
 *
 * ## Le coût, compté plutôt qu'estimé
 *
 * **Pas « quatre lectures ».** À `companyId: null`, deux des cinq lecteurs
 * répondent **sans requête** — un visiteur n'a ni engagement
 * (`PrismaVolumeCommitmentReader.liveFor`) ni mercuriale
 * (`PrismaCompanyMercurialeReader.liveFor`). Les trois autres passent par
 * `PricingMaterialsCache`, qui porte déjà son invalidation et son estampille :
 * une rafale de visiteurs ne coûte donc qu'une lecture d'estampille.
 *
 * Ce qui n'est **pas** caché, et c'est le vrai coût à surveiller : si un
 * plancher visant ces articles porte une porte de volume
 * (`dynamic.unlock.minVolumeRatioBp`), le chargeur ajoute **deux agrégats
 * d'historique** par appel. Aucun plancher public n'en porte aujourd'hui ; le
 * jour où l'un en portera, la vitrine anonyme paiera deux lectures non cachées
 * par requête, et c'est le moment où un cache de réponse se posera (vérifié le
 * 2026-09-09).
 *
 * Les suggestions ne tarifient que leurs articles (`pricedItems`, 2026-11-02) :
 * elles payaient chacune le rayon entier, trois à quatre fois par changement
 * d'espace, et ce calcul en mémoire n'est pas dans la durée de la sonde.
 *
 * Aucun cache de réponse n'est posé ici : celui des matériaux suffit tant que la
 * porte de volume reste absente, et un cache de plus amènerait une seconde
 * invalidation à tenir d'accord avec la première.
 */
@Injectable()
export class ShopCataloguePricing {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly pricer: Pricer,
    private readonly operations: CatalogOperationsReader,
    private readonly clock: Clock,
    private readonly cutoffs: ShopOrderCutoffsReader,
    private readonly pricesPerKg: CatalogPricePerKgReader,
    private readonly viewers: CatalogViewers,
    private readonly offers: ShopCatalogueOffers,
  ) {}

  /**
   * Ce qui est en vente, **au prix qui sera facturé**.
   *
   * @param companyId `null` = un visiteur. Le tarif public, promotions
   * comprises, et aucune mercuriale lue — il n'y a rien à négocier sans client.
   * @param buyerKind la porte d'entrée, posée par la ROUTE (lot L10 du plan des
   * promotions) : `guest` sur la route publique, `registered` sur la reconnue.
   * @param language la langue des noms, lignes et rayons (lot des langues) —
   * le français quand le référentiel n'a rien traduit. Ni le rangement ni le
   * prix n'en dépendent.
   */
  async priced(
    companyId: string | null,
    buyerKind: ShelfBuyerKind,
    language: ContentLocale,
  ): Promise<ShopCatalogueView> {
    // 🔴 **L'audience se déduit ICI, et c'est le seul endroit.** « Sans société »
    // veut dire « sans rien de négocié » : ni mercuriale, ni tarif de canal — et
    // donc le prix d'étiquette. La déduction est la même que celle qui pilotait
    // déjà la mercuriale ; elle nomme simplement ce qu'elle voulait dire.
    //
    // Le lecteur d'une société porte sa réservation (`plan-articles-sur-mesure.md`,
    // § 6) : le rayon reconnu liste aussi, verrouillé, ce qui est réservé à un
    // autre compte et réglé « visible, non commandable » (S7).
    //
    // Et c'est la fabrique qui décide si la société est servie en pro
    // (`plan-pros-en-cours-d-inscription.md`, P0) : servie au public, elle ne
    // passe PAS son identifiant au tarificateur — ni mercuriale, ni tarif de canal.
    return (await this.shelf(companyId, buyerKind, language)).view;
  }

  /**
   * {@link priced}, avec le principal actuel de la société lu dans la même
   * lecture — ce que le cache des rayons pro range à côté du rayon (C2).
   */
  async shelf(
    companyId: string | null,
    buyerKind: ShelfBuyerKind,
    language: ContentLocale,
  ): Promise<PricedShelf> {
    const { viewer, principalId } = await this.viewers.forShelf(companyId, "served_and_locked");
    const buyer = { companyId: pricingCompanyOf(viewer), buyerKind };
    return { ...(await this.composedFor(viewer, buyer, language, SHELF_SCOPE)), principalId };
  }

  /** Le lecteur et l'acheteur de la route reconnue — la déduction de {@link priced}. */
  private async recognised(
    companyId: string,
  ): Promise<{ readonly viewer: CatalogViewer; readonly buyer: ShelfBuyer }> {
    const viewer = await this.viewers.forCompany(companyId, "served_and_locked");
    return { viewer, buyer: { companyId: pricingCompanyOf(viewer), buyerKind: "registered" } };
  }

  /**
   * **Quelques articles du rayon, à leur prix** — les suggestions. Le MÊME
   * chemin que {@link priced} (une société) ou {@link pricedWithoutCompany}
   * (une audience) ; seul le lot remis au tarificateur est réduit. Un SKU
   * absent du rayon de ce lecteur est absent du résultat ; ordre du rayon.
   */
  async pricedItems(
    skus: readonly string[],
    shelfOf: { readonly companyId: string } | { readonly audience: ShopAudience },
    language: ContentLocale = CATALOG_SOURCE_LANGUAGE,
  ): Promise<readonly ShopItemView[]> {
    if (skus.length === 0) {
      return [];
    }
    const scope: ShelfScope = { only: new Set(skus), caller: "suggestions" };
    const { viewer, buyer } =
      "companyId" in shelfOf
        ? await this.recognised(shelfOf.companyId)
        : withoutCompany(shelfOf.audience);
    return (await this.pricedFor(viewer, buyer, language, scope)).items;
  }

  /**
   * La vitrine d'une audience **sans société** — pour l'aperçu des
   * suggestions du staff (RS5, `suggestions-du-staff.md`), qui n'a pas de
   * client. À `public`, c'est exactement `priced(null)`. À `pro`, le rayon des
   * pros au prix sans rien de négocié : ni mercuriale, ni tarif de canal — ce
   * qu'aucun pro réel ne voit tout à fait, et que l'aperçu dit. La boutique ne
   * l'appelle jamais POUR UN CLIENT : la déduction de `priced` reste la seule
   * pour un client.
   *
   * Depuis le 2026-10-19 (Hugo), c'est aussi la vitrine pro **sans jeton**
   * (`GET /shop/catalogue?audience=pro`) : le tarif pro de base est public,
   * les conditions négociées ne le sont pas — et elles ne peuvent pas fuir
   * d'ici, la porte ne recevant aucune société.
   *
   * À `pro`, l'audience est DÉCLARÉE par la requête : seules les promotions
   * « tout le monde » y jouent (`previewed`, plan des promotions, § 13.7) —
   * sans quoi taper `?audience=pro` publierait une promotion réservée. À
   * `public`, c'est la route publique : un invité.
   */
  pricedWithoutCompany(
    audience: ShopAudience,
    language: ContentLocale = CATALOG_SOURCE_LANGUAGE,
  ): Promise<ShopCatalogueView> {
    const { viewer, buyer } = withoutCompany(audience);
    return this.pricedFor(viewer, buyer, language, SHELF_SCOPE);
  }

  private async pricedFor(
    viewer: CatalogViewer,
    buyer: ShelfBuyer,
    language: ContentLocale,
    scope: ShelfScope,
  ): Promise<ShopCatalogueView> {
    return (await this.composedFor(viewer, buyer, language, scope)).view;
  }

  private async composedFor(
    viewer: CatalogViewer,
    buyer: ShelfBuyer,
    language: ContentLocale,
    scope: ShelfScope,
  ): Promise<ComposedShelf> {
    const audience = viewerAudience(viewer);
    // Les opérations datées se lisent avec le rayon (D5) : deux lectures de
    // plus sur la route anonyme, sans cache — le miroir des opérations tient
    // en quelques lignes, et une clôture doit s'appliquer à la minute.
    // Les heures limites en vigueur : une lecture de plus, pour ne montrer la
    // limite d'un article que si elle est plus stricte que la générale (§9).
    const [sellable, operations, operationOnlySkus, cutoffs] = await Promise.all([
      this.catalog.listSellable(viewer),
      this.operations.sellableOperations(),
      this.operations.operationOnlySkus(),
      this.cutoffs.list(),
    ]);
    // Le même instant pour la vue et pour son échéance : l'instant qui
    // l'ouvrira est celui que la vue n'a pas encore appliqué.
    const now = this.clock.now();
    const shown = shopCatalogueOf(sellable, { operations, operationOnlySkus, audience, now });
    const nextChangeAt = nextOperationChange(operations, audience, now);
    const catalogue = scopedTo(withOrderLimits(shown, sellable, cutoffs), scope);
    if (catalogue.items.length === 0) {
      return { view: catalogue, nextChangeAt };
    }
    const [priced, perKg, offered] = await Promise.all([
      this.withPrices(catalogue, sellable, { ...buyer, audience }, scope.caller),
      // Lus À CÔTÉ de la résolution, jamais par elle : informatifs
      // (`plan-prix-au-kilo.md`, K3).
      this.pricesPerKg.bySkus(shownVariantSkus(catalogue, sellable)),
      // Les promotions qu'un acheminement ouvrirait (L10) : MENTIONNÉES, jamais
      // appliquées au prix du rayon, où l'acheminement est inconnu.
      this.offers.offeredFor(buyer, catalogue, audience),
    ]);
    const mentioned = withFulfillmentOffers(
      withPromotionNames(priced.view, priced.promotionNames, language),
      sellable,
      offered,
      this.clock.now(),
      language,
      priced.sealing,
    );
    return {
      view: inShopLanguage(
        withPricesPerKg(mentioned, sellable, perKg, audience),
        sellable,
        language,
      ),
      nextChangeAt,
    };
  }

  /** La vitrine au prix résolu, tarif barré quand une résolution le baisse. */
  private async withPrices(
    catalogue: ShopCatalogueView,
    sellable: readonly ResolvedCatalogItem[],
    { companyId, buyerKind, audience }: ShelfBuyer & { readonly audience: ShopAudience },
    caller: PricingCaller,
  ): Promise<ShelfPrices> {
    // 🔴 La LIGNÉE de la famille, lue sur l'article du catalogue et non sur la
    // vue : `ShopItemView.shelfId` ne porte que la famille elle-même, et une
    // règle posée sur une parente ne mordrait pas.
    const byShopSku = shownByShopSku(sellable);
    const articles = catalogue.items.flatMap((item) => {
      const source = byShopSku.get(item.sku);
      return source === undefined
        ? []
        : [
            {
              // La frappe : la vitrine vient de LIRE le catalogue, elle est donc
              // en droit de sceller ce qu'elle a lu.
              article: catalogueArticle({
                sku: item.sku,
                name: item.name,
                categoryPath: source.family.path,
                unitPriceMillicents: item.unitPriceMillicents,
                saleUnit: source.saleUnit,
              }),
              // 🔴 **Quantité 1, et c'est une limite assumée.** `minQuantity`
              // existe à tous les étages : un palier « à partir de 50 » ne se
              // voit pas au rayon. Le panier, lui, résout à la quantité réelle.
              quantity: 1,
            },
          ];
    });

    if (articles.length === 0) {
      // Rien à tarifer : la vitrine sort au tarif, c'est-à-dire exactement ce
      // qu'elle servait avant R22. Un rayon vide serait pire qu'un rayon au
      // canonique.
      return { view: catalogue, sealing: new Map(), promotionNames: new Map() };
    }

    // 🔴 La porte prend l'instant elle-même, une fois pour tout le lot : deux
    // articles résolus à quelques millisecondes d'écart pourraient sinon tomber
    // de part et d'autre du basculement d'une promotion.
    const lot = await this.pricer.load({
      articles,
      buyer: { kind: "real", companyId, buyerKind },
      caller,
    });
    const lines = articles.map(({ article, quantity }) => ({ sku: article.sku, quantity }));
    const all = lot.all(lines);
    const prices = new Map(all.map((priced) => [priced.sku, priced.finalMillicents]));
    return {
      view: { ...catalogue, items: catalogue.items.map((item) => struck(item, prices, audience)) },
      sealing: sealingOfShelf(all),
      promotionNames: promotionNamesOf(all),
    };
  }
}
