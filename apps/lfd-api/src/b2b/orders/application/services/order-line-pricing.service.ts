import { Injectable } from "@nestjs/common";
import type { OrderLineInput as OrderLineRequest } from "@lfd/contracts";

import {
  pricingContextFor,
  type PricingParties,
} from "../../../pricing/application/pricing-context.js";
import { observedRatioBp } from "@lfd/money";
import { rollingWindows } from "../../../pricing/domain/elasticity-windows.js";
import { CustomerVolumeReader } from "../../../pricing/domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../../../pricing/domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../../pricing/domain/ports/price-rule.reader.js";
import { CompanyMercurialeReader } from "../../../pricing/domain/ports/company-mercuriale.reader.js";
import { SkuVolumeReader } from "../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../../pricing/domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../../../pricing/domain/ports/volume-ladder.reader.js";
import type { PricingContext } from "../../../pricing/domain/price-rule.js";
import {
  floorsFor,
  materialsOf,
  NO_EVIDENCE,
  type PricingEvidence,
  type PricingMaterials,
} from "../../../pricing/domain/pricing-materials.js";
import { scopesOfAll } from "../../../pricing/domain/pricing-scopes.js";
import { resolveScopedFloor } from "../../../pricing/domain/resolve-floor.js";
import { commitmentFor, type VolumeCommitment } from "../../../pricing/domain/volume-commitment.js";
import { UnknownSkuError } from "../../domain/errors/order-errors.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import {
  priceLine,
  type LineToPrice,
  type ResolvedOrderLine,
} from "../../domain/services/price-line.js";
import { Clock } from "../../../../platform/time/clock.js";

export type { ResolvedOrderLine };

/** Un article du panier, sa quantité fusionnée, et la portée qu'il vise. */
interface LineEntry {
  readonly item: LineToPrice;
  readonly quantity: number;
  /**
   * Le contexte **sans le cumul d'engagement**.
   *
   * Il suffit à tout ce qui se décide avant la mesure : la portée d'un matériau
   * et le plancher qui vise l'article ne dépendent ni de la quantité ni de
   * l'historique — `resolveScopedFloor` ne filtre que par `matchesScope`. C'est
   * cette indépendance qui permet de mesurer EN AMONT, et donc par lot.
   */
  readonly scopeContext: PricingContext;
}

/**
 * **Le prix des lignes d'un panier**, et rien d'autre.
 *
 * Extrait de `OrderDrafting`, qui composait à la fois le prix ET l'acheminement
 * — deux raisons de changer dans un même fichier. Ici vivent le catalogue, les
 * règles, les barèmes et les planchers ; là-bas restent les points de retrait,
 * les zones et les défauts de livraison.
 *
 * ## 🔴 Ce service ne décide plus rien — il rassemble
 *
 * La recette qui fabrique un prix vivait ici, dans quatre-vingt-dix lignes
 * `async` : six étapes pures prisonnières de deux lectures, et donc une recette
 * qui ne s'éprouvait qu'avec sept doublés. Elle est passée dans `priceLine`,
 * **pure**, qu'on énumère au lieu de la monter.
 *
 * Ce qui reste est le travail d'un orchestrateur, en trois temps :
 *
 * 1. **charger les matériaux, une fois pour le panier** — ils se lisaient par
 *    article, soit trois requêtes par ligne avec le même `WHERE` à un
 *    identifiant près ;
 * 2. **mesurer ce qu'il faut mesurer, par lot** — la paresse est conservée, les
 *    mêmes prédicats décident, ils décident simplement avant ;
 * 3. **appeler la fonction pure**, une fois par ligne.
 *
 * Le compte de lectures ne dépend donc plus de la taille du panier.
 */
@Injectable()
export class OrderLinePricing {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly priceRules: PriceRuleReader,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly priceFloors: PriceFloorReader,
    private readonly skuVolumes: SkuVolumeReader,
    private readonly volumeLadders: VolumeLadderReader,
    private readonly commitments: VolumeCommitmentReader,
    private readonly customerVolumes: CustomerVolumeReader,
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
   * @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas.
   */
  async resolve(
    input: readonly OrderLineRequest[],
    parties: PricingParties,
  ): Promise<ResolvedOrderLine[]> {
    return this.priceAll(input, parties, false);
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
    parties: PricingParties,
  ): Promise<ResolvedOrderLine[]> {
    return this.priceAll(input, parties, true);
  }

  private async priceAll(
    input: readonly OrderLineRequest[],
    parties: PricingParties,
    withTiers: boolean,
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
    const at = this.clock.now();

    // Le catalogue est résolu EN UN LOT, avant tout le reste : depuis qu'il vient
    // de la base, le résoudre ligne à ligne ferait une requête par ligne de
    // panier sur le chemin qui facture.
    const catalogue = await this.catalog.resolveMany([...quantities.keys()]);
    // 🔴 Le SKU inconnu est refusé AVANT le chargement des matériaux. Charger
    // d'abord ferait payer des lectures pour un panier qu'on va refuser.
    const entries = [...quantities].map(([sku, quantity]): LineEntry => {
      const item = catalogue.get(sku);
      if (item === undefined) {
        throw new UnknownSkuError(sku);
      }
      const line: LineToPrice = {
        sku: item.sku,
        name: item.name,
        unitPriceMillicents: item.unitPriceMillicents,
        vatRate: item.vatRate,
        category: item.category,
        allergens: item.allergens,
      };
      return {
        item: line,
        quantity,
        scopeContext: pricingContextFor(line.sku, line.category, quantity, parties, at),
      };
    });

    const scopes = scopesOfAll(entries.map((entry) => entry.scopeContext));
    if (scopes === null) {
      return [];
    }
    // Quatre lectures pour tout le panier, en parallèle — contre trois PAR
    // article auparavant, plus celle des engagements.
    const [rules, floors, ladders, commitments, mercuriale] = await Promise.all([
      this.priceRules.inScopes(scopes),
      this.priceFloors.inScopes(scopes),
      this.volumeLadders.inScopes(scopes),
      // Un client de passage n'a pas d'engagement, et le port le sait sans
      // interroger la base.
      this.commitments.liveFor(parties.companyId),
      // La mercuriale arrive en OBJET : c'est ici qu'on ne connaît pas encore la
      // quantité de chaque ligne, donc pas le palier. Cf. `asRuleFor`.
      this.mercuriales.liveFor(parties.companyId, at),
    ]);
    const materials = materialsOf({ rules, floors, ladders, commitments, mercuriale });
    const evidence = await this.measure(entries, materials, at);

    return entries.map((entry) =>
      priceLine(
        { item: entry.item, quantity: entry.quantity, parties, at, withTiers },
        materials,
        evidence,
      ),
    );
  }

  /**
   * **Ce qu'il faut mesurer**, et rien de plus — mais mesuré par lot.
   *
   * Les deux mesures étaient lues DANS la boucle, chacune derrière un prédicat
   * pur. La paresse était bonne, et elle est conservée : les mêmes prédicats
   * décident, sur des matériaux déjà chargés. Ce qui change est qu'une mesure
   * demandée pour dix articles coûte une lecture au lieu de dix.
   *
   * Un panier ordinaire — aucun engagement, aucun plancher à porte de volume —
   * ne coûte **aucune** lecture ici, comme avant.
   */
  private async measure(
    entries: readonly LineEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<PricingEvidence> {
    const [ordered, ratios] = await Promise.all([
      this.orderedVolumes(entries, materials, at),
      this.volumeRatios(entries, materials, at),
    ]);
    return ordered.size === 0 && ratios.size === 0
      ? NO_EVIDENCE
      : { orderedBySku: ordered, volumeRatioBySku: ratios };
  }

  /**
   * Le cumul déjà commandé, **par engagement**.
   *
   * Groupé par engagement et non par panier : chacun porte SA fenêtre, et une
   * lecture unique sur une fenêtre inventée compterait des commandes hors
   * période. Un panier a zéro ou un engagement dans l'immense majorité des cas,
   * donc ce groupement ne fait pas revenir la boucle qu'on vient de retirer.
   */
  private async orderedVolumes(
    entries: readonly LineEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<ReadonlyMap<string, number>> {
    const bySkus = new Map<string, { commitment: VolumeCommitment; skus: string[] }>();
    for (const { item } of entries) {
      const commitment = commitmentFor(
        materials.commitments,
        { categoryId: item.category, productSku: item.sku, variantSku: item.sku },
        at,
      );
      if (commitment === null) {
        continue;
      }
      const group = bySkus.get(commitment.id);
      if (group === undefined) {
        bySkus.set(commitment.id, { commitment, skus: [item.sku] });
      } else {
        group.skus.push(item.sku);
      }
    }
    if (bySkus.size === 0) {
      return new Map();
    }
    const reads = await Promise.all(
      [...bySkus.values()].map(({ commitment, skus }) =>
        this.customerVolumes.volumesFor(commitment.companyId, skus, {
          from: commitment.validFrom,
          to: commitment.validTo,
        }),
      ),
    );
    return new Map(reads.flatMap((read) => [...read]));
  }

  /**
   * Le ratio de volume observé, **uniquement pour les articles dont un plancher
   * le réclame**.
   *
   * Aucune lecture si aucun plancher n'a de porte, ou si aucune de ces portes ne
   * parle de volume : la très grande majorité des paniers ne paie donc rien pour
   * cette mesure. C'est la seule façon d'admettre une lecture d'historique sur le
   * chemin qui facture sans le ralentir pour tout le monde.
   *
   * Les fenêtres sont les MÊMES pour tous les articles — elles ne dépendent que
   * de l'instant —, d'où deux lectures en tout plutôt que deux par article.
   */
  private async volumeRatios(
    entries: readonly LineEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<ReadonlyMap<string, number | null>> {
    const gated = entries
      .filter(({ scopeContext }) => {
        const scoped = resolveScopedFloor(floorsFor(materials, scopeContext), scopeContext);
        return scoped?.policy.dynamic?.unlock.minVolumeRatioBp != null;
      })
      .map(({ item }) => item.sku);
    if (gated.length === 0) {
      return new Map();
    }
    const windows = rollingWindows(at);
    const [baseline, observed] = await Promise.all([
      this.skuVolumes.volumesFor(gated, windows.baseline),
      this.skuVolumes.volumesFor(gated, windows.observed),
    ]);
    return new Map(
      gated.map((sku) => [sku, observedRatioBp(baseline.get(sku) ?? 0, observed.get(sku) ?? 0)]),
    );
  }
}
