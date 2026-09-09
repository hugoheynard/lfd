import { Injectable } from "@nestjs/common";
import type { MercurialeBenchmarkView } from "@lfd/contracts";

import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { benchmarkByProduct } from "../../domain/services/mercuriale-benchmark.js";
import type { NegotiatedPrice } from "../../domain/services/mercuriale-benchmark.js";
import { LoadedPricer } from "../../domain/loaded-pricer.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import type { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";

/**
 * **Ce que le marché paie déjà, article par article.**
 *
 * L'indicateur d'aide du commercial : avant d'accorder un prix, savoir où il se
 * situe par rapport aux mercuriales **en place chez les autres clients**.
 *
 * Le prix de chaque observation passe par `resolvePrice`, **la fonction qui
 * facture**, plutôt que par une lecture directe d'`amountMillicents` : c'est ce
 * qui empêche l'indicateur de dériver de ce qui est réellement encaissé. Deux
 * façons de dériver un prix négocié finiraient par ne plus dire la même chose,
 * et c'est ici que ça se verrait le plus tard.
 *
 * ⚠️ Ce JSDoc a donné une AUTRE raison jusqu'au 2026-09-08 : « une mercuriale
 * peut être posée en `replace` comme en `alter` ». C'est faux, et ça l'a
 * toujours été — `PricingRule.create` refuse `alter` à cet étage
 * (`MercurialeMustPoseAPriceError`) depuis le premier commit qui a permis
 * d'écrire une règle. Vérifié en base le 2026-09-08 : aucune ligne `alter` à
 * l'étage mercuriale, et aucune n'a jamais pu y être écrite. Une justification
 * fausse est pire qu'une absence de justification : elle fait garder un
 * mécanisme pour une raison qui n'existe pas, et défendre l'inverse le jour où
 * quelqu'un propose de le simplifier.
 *
 * Le **plancher n'est pas appliqué**, et c'est délibéré : il est propre à un
 * client, alors qu'on mesure ici un prix de marché. Un prix relevé chez un seul
 * compte n'est pas ce que les autres paient.
 */
@Injectable()
export class MercurialeBenchmarkQuery {
  constructor(
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
  ) {}

  async byProduct(): Promise<readonly MercurialeBenchmarkView[]> {
    const at = this.clock.now();
    const mercuriales = await this.mercuriales.liveEverywhere(at);

    const skus = [
      ...new Set(mercuriales.flatMap((mercuriale) => mercuriale.lines.map((line) => line.sku))),
    ];
    const catalogue = await this.catalog.resolveMany(skus);

    return benchmarkByProduct(
      mercuriales.flatMap((mercuriale) => this.observationsOf(mercuriale, catalogue, at)),
    );
  }

  /**
   * Une mercuriale → une observation **par palier**.
   *
   * Un palier est un prix accordé à part entière : « 1,73 € l'unité, 1,60 € à
   * partir de 500 » sont deux points du marché, pas un. C'est exactement ce que
   * la lecture d'avant le 2026-09-08 rendait — une règle par palier, donc une
   * observation par palier —, et le comparatif ne doit pas changer de sens en
   * changeant de source.
   *
   * Rien quand le catalogue ne connaît plus l'article : `resolvePrice` exige un
   * prix canonique d'entrée, et faire disparaître la ligne est plus honnête que
   * de lui en inventer un.
   */
  private observationsOf(
    mercuriale: CompanyMercuriale,
    catalogue: Awaited<ReturnType<ProductCatalogReader["resolveMany"]>>,
    at: Date,
  ): NegotiatedPrice[] {
    const { companyId } = mercuriale.toPersistence();
    return mercuriale.lines.flatMap((line) => {
      const canonicalMillicents = catalogue.get(line.sku)?.unitPriceMillicents;
      if (canonicalMillicents === undefined) {
        return [];
      }
      return line.tiers.flatMap((tier) => {
        // Chaque palier est mesuré **à sa propre quantité** : l'évaluer à 1
        // l'écarterait dès qu'il s'ouvre plus haut, et le marché perdrait ses
        // prix de volume négociés.
        const unitPriceMillicents = LoadedPricer.mercurialeAlone(
          mercuriale,
          companyId,
          { sku: line.sku, canonicalMillicents },
          tier.minQuantity,
          at,
        );
        if (unitPriceMillicents === null) {
          return [];
        }
        return [{ sku: line.sku, companyId, unitPriceMillicents }];
      });
    });
  }
}
