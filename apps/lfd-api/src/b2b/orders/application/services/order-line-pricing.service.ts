import { Injectable } from "@nestjs/common";
import { saleUnitOfLine, type OrderLineInput as OrderLineRequest } from "@lfd/contracts";

import type { PricingParties } from "../../../pricing/domain/loaded-pricer.js";

/** La société servie, seule clé que l'appelant connaît. */
type ServedCompany = Pick<PricingParties, "companyId">;
import { Pricer } from "../../../pricing/application/pricer.js";
import { UnknownSkuError } from "../../../catalog/domain/errors/unknown-sku.error.js";
import {
  type CatalogItem,
  ProductCatalogReader,
} from "../../../catalog/domain/ports/product-catalog.reader.js";
import { minQuantityFor } from "../../../catalog/domain/catalog-min-quantities.js";
import {
  ensureMinimumQuantity,
  ensureSaleQuantity,
} from "../../domain/services/sale-quantity-rules.js";
import {
  priceLine,
  type LineToPrice,
  type ResolvedOrderLine,
} from "../../domain/services/price-line.js";
import { Clock } from "../../../../platform/time/clock.js";
import { splitStaleUnitLines, type StaleUnitLine } from "../../domain/services/stale-unit-lines.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";

export type { ResolvedOrderLine };

/**
 * **Le prix des lignes d'un panier**, et rien d'autre.
 *
 * Extrait d'`OrderDrafting`, qui composait à la fois le prix ET l'acheminement
 * — deux raisons de changer dans un même fichier. Ici vivent le catalogue et la
 * mise en forme d'une ligne ; là-bas restent les points de retrait, les zones et
 * les défauts de livraison.
 *
 * ## 🔴 Ce service ne décide plus rien
 *
 * La recette qui fabrique un prix vivait ici, dans quatre-vingt-dix lignes
 * `async`. Elle est passée dans le **tarificateur** (`LoadedPricer`), qui est
 * désormais le seul appelant de `resolvePrice` du dépôt, et le chargement dans
 * `PricingMaterialsLoader`, qui est la seule séquence de lecture. Ce qui reste
 * est le travail d'un orchestrateur, en trois temps :
 *
 * 1. **résoudre le catalogue en un lot** — c'est lui l'autorité de prix, jamais
 *    le client ;
 * 2. **demander le tarificateur** pour ce lot, ce client, cet instant ;
 * 3. **façonner** chaque ligne.
 *
 * Le compte de lectures ne dépend pas de la taille du panier.
 */
@Injectable()
export class OrderLinePricing {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly pricer: Pricer,
    private readonly clock: Clock,
  ) {}

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune —
   * c'est ici que le prix devient autoritaire, jamais celui du client.
   *
   * La fusion précède tout, et c'est ce qui rend le palier de volume juste :
   * deux lignes de 60 croissants ouvrent le palier « 100+ », alors qu'aucune ne
   * l'ouvrirait seule.
   *
   * ⚠️ **`PricingParties` et non `OrderParties`** : ce service ne lit que le
   * `companyId`. Le port s'est resserré pour que le devis PUBLIC de la boutique
   * puisse l'appeler — il n'a pas de saisisseur à nommer, et lui en inventer un
   * aurait mis une fausse identité sur le chemin qui tarife.
   *
   * Seule la société servie : le compte de tarif (un principal suivi) est
   * résolu par la porte du prix, à l'instant de la résolution.
   *
   * @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas.
   * @throws {QuantityBelowMinimumError} un SKU sous le minimum de la clientèle.
   */
  async resolve(
    input: readonly OrderLineRequest[],
    parties: ServedCompany,
    caller: PricingCaller,
    at?: Date,
  ): Promise<ResolvedOrderLine[]> {
    return this.priceAll(input, parties, { withTiers: false, caller }, at);
  }

  /**
   * **Le même prix, plus ce qui l'explique** — pour un devis, jamais pour une
   * commande.
   *
   * La seule différence est la grille du barème, qui coûte une résolution
   * complète par palier. La facturer à chaque commande ferait payer à toutes les
   * ventes un tableau que seul le devis affiche — et lui donnerait un mode de
   * défaillance qu'une vente n'a pas à connaître.
   */
  async explain(
    input: readonly OrderLineRequest[],
    parties: ServedCompany,
    caller: PricingCaller,
    at?: Date,
  ): Promise<ResolvedOrderLine[]> {
    return this.priceAll(input, parties, { withTiers: true, caller }, at);
  }

  /**
   * **Le minimum en pièces de chaque SKU, pour la clientèle servie** — une
   * lecture du catalogue par lot, sans tarifer. Sert les lignes GARDÉES d'une
   * révision dont la quantité change (dérogation à R3, Hugo, 2026-10-29) :
   * leur prix reste figé, seul le minimum se relit.
   *
   * Même déduction d'audience que {@link priceAll}, pour que la ligne gardée
   * soit tenue au minimum même qu'une ligne nouvelle. Un SKU sorti du
   * catalogue est ABSENT de la table rendue, jamais présent à `null`.
   */
  async minimumsOf(
    skus: readonly string[],
    parties: ServedCompany,
  ): Promise<ReadonlyMap<string, number | null>> {
    if (skus.length === 0) {
      return new Map();
    }
    const audience = parties.companyId === null ? "public" : "pro";
    const catalogue = await this.catalog.resolveMany(skus, audience);
    return new Map(
      [...catalogue].map(([sku, item]) => [sku, minQuantityFor(item.minQuantities, audience)]),
    );
  }

  /**
   * **Le panier sans ses lignes d'une unité périmée** — pour le devis de la
   * boutique (`plan-changer-l-unite-de-vente.md`, § 8). Une lecture du
   * catalogue par lot, dans l'audience du prix.
   */
  async withoutStaleUnits(
    input: readonly OrderLineRequest[],
    parties: ServedCompany,
  ): Promise<{
    readonly kept: readonly OrderLineRequest[];
    readonly removed: readonly StaleUnitLine[];
  }> {
    if (input.length === 0) {
      return { kept: input, removed: [] };
    }
    const audience = parties.companyId === null ? "public" : "pro";
    const catalogue = await this.catalog.resolveMany(
      [...new Set(input.map((line) => line.sku))],
      audience,
    );
    const split = splitStaleUnitLines(
      input.map((line) => ({ line, sku: line.sku, saleUnit: saleUnitOfLine(line) })),
      catalogue,
    );
    return { kept: split.kept.map(({ line }) => line), removed: split.removed };
  }

  private async priceAll(
    input: readonly OrderLineRequest[],
    parties: ServedCompany,
    { withTiers, caller }: { readonly withTiers: boolean; readonly caller: PricingCaller },
    /**
     * L'instant de résolution, **quand l'appelant en a un**.
     *
     * Le checkout ne le passe jamais : un prix qui facture se résout à
     * l'horloge de la requête, et laisser un appelant choisir son instant sur ce
     * chemin-là ouvrirait la porte à une commande passée « hier ». Seule une
     * LECTURE datée le renseigne — « que payait-il le 3 mars ? » —, et elle
     * n'écrit rien.
     */
    requestedAt: Date | undefined,
  ): Promise<ResolvedOrderLine[]> {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    }

    // L'instant est pris UNE fois pour toute la commande : deux lignes résolues à
    // quelques millisecondes d'écart pourraient sinon tomber de part et d'autre
    // du basculement d'une promotion.
    //
    // Et il vient de l'horloge de la REQUÊTE, pas du mur. C'est le chemin qui
    // FACTURE — un prix s'y défend devant le client, donc il doit être rejouable
    // à un instant nommé, pas dépendre de la milliseconde du serveur.
    //
    // ⚠️ Sauf lecture datée explicite : `requestedAt` est absent partout sauf
    // sur le chemin qui RELIT un prix passé.
    const at = requestedAt ?? this.clock.now();

    // Le catalogue est résolu EN UN LOT, avant tout le reste : depuis qu'il vient
    // de la base, le résoudre ligne à ligne ferait une requête par ligne de
    // panier sur le chemin qui facture.
    //
    // 🔴 **L'audience décide de l'entrée**, et c'est la même déduction qu'au
    // rayon : « sans société » veut dire « sans rien de négocié », donc le prix
    // d'étiquette. La faire ici ET au rayon n'est pas une duplication, c'est
    // l'exigence que les deux s'accordent — `quote-order-parity` le tient, et
    // un e2e du rayon vérifie qu'il annonce ce que le devis chiffre.
    const audience = parties.companyId === null ? "public" : "pro";
    const catalogue = await this.catalog.resolveMany([...quantities.keys()], audience);
    // 🔴 Le SKU inconnu est refusé AVANT le chargement des matériaux. Charger
    // d'abord ferait payer des lectures pour un panier qu'on va refuser.
    //
    // Et chaque ligne DEMANDÉE se valide contre son article avant la fusion :
    // son unité, et au poids son pas, son minimum, sa garde
    // (`vente-au-poids.md`, P3). Refusée, jamais corrigée.
    for (const line of input) {
      ensureSaleQuantity(foundOrRefused(catalogue, line.sku), {
        quantity: line.quantity,
        saleUnit: saleUnitOfLine(line),
      });
    }
    // Puis le TOTAL de chaque SKU contre le minimum de SA clientèle
    // (`plan-quantite-minimale.md`, Q5) — la même audience que le prix, donc
    // le même minimum que le rayon a annoncé. Devis et passation passent ici.
    for (const [sku, quantity] of quantities) {
      const found = foundOrRefused(catalogue, sku);
      ensureMinimumQuantity(
        { ...found, minQuantity: minQuantityFor(found.minQuantities, audience) },
        quantity,
      );
    }
    const lines = [...quantities].map(([sku, quantity]) => {
      const found = foundOrRefused(catalogue, sku);
      const item: LineToPrice = {
        sku: found.sku,
        name: found.name,
        unitPriceMillicents: found.unitPriceMillicents,
        vatRate: found.vatRate,
        allergens: found.allergens,
        // L'article SCELLÉ, tel que le catalogue l'a frappé : c'est lui que le
        // tarificateur exige, et c'est ce qui interdit de lui présenter un prix
        // qu'on aurait recopié d'ailleurs.
        article: found.article,
      };
      return { item, quantity };
    });

    if (lines.length === 0) {
      // Un panier vide n'a rien à charger. La porte le refuse, et c'est à
      // l'appelant qui peut en avoir un de le dire — pas au chargeur de rendre
      // un tarificateur muet.
      return [];
    }

    const lot = await this.pricer.load({
      articles: lines.map(({ item, quantity }) => ({ article: item.article, quantity })),
      companyId: parties.companyId,
      at,
      caller,
    });

    return lines.map(({ item, quantity }) => priceLine({ item, quantity, withTiers }, lot));
  }
}

/** @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas. */
function foundOrRefused(catalogue: ReadonlyMap<string, CatalogItem>, sku: string): CatalogItem {
  const found = catalogue.get(sku);
  if (found === undefined) {
    throw new UnknownSkuError(sku);
  }
  return found;
}
