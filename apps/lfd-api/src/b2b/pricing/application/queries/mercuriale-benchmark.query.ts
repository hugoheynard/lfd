import { Injectable } from "@nestjs/common";
import type { MercurialeBenchmarkView } from "@lfd/contracts";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { benchmarkByProduct } from "../../domain/services/mercuriale-benchmark.js";
import type { NegotiatedPrice } from "../../domain/services/mercuriale-benchmark.js";
import { resolvePrice } from "../../domain/resolve-price.js";
import { ruleFromRow } from "../../infrastructure/price-rows.js";

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
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
  ) {}

  async byProduct(): Promise<readonly MercurialeBenchmarkView[]> {
    const at = this.clock.now();
    const rows = await this.prisma.priceRule.findMany({
      where: {
        stage: "mercuriale",
        // En place : ni archivée, ni suspendue, et dans sa fenêtre. Une décision
        // qui a cessé d'agir n'est plus ce que le client paie.
        archivedAt: null,
        pausedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
        // Nommément un article, et chez un client nommé : une règle de famille ou
        // de catalogue n'est pas un prix négocié, c'est le tarif de tout le monde.
        scopeType: { in: ["product", "variant"] },
        audienceType: "company",
      },
    });

    const skus = [...new Set(rows.map((row) => row.scopeId).filter((sku) => sku !== null))];
    const catalogue = await this.catalog.resolveMany(skus);

    return benchmarkByProduct(rows.flatMap((row) => this.observationOf(row, catalogue, at) ?? []));
  }

  /**
   * Une règle → une observation, ou rien.
   *
   * Rien quand le catalogue ne connaît plus l'article : `resolvePrice` exige un
   * prix canonique d'entrée, et la faire disparaître est plus honnête que de lui
   * en inventer un.
   *
   * (La version d'avant le 2026-09-08 justifiait ça par la forme `alter`, qui
   * n'existe pas à cet étage — cf. le JSDoc de la classe.)
   */
  private observationOf(
    row: Parameters<typeof ruleFromRow>[0] & { scopeId: string | null; audienceId: string | null },
    catalogue: Awaited<ReturnType<ProductCatalogReader["resolveMany"]>>,
    at: Date,
  ): NegotiatedPrice | null {
    const sku = row.scopeId;
    const companyId = row.audienceId;
    const canonicalMillicents = sku === null ? undefined : catalogue.get(sku)?.unitPriceMillicents;
    if (sku === null || companyId === null || canonicalMillicents === undefined) {
      return null;
    }
    const rule = ruleFromRow(row);
    const resolved = resolvePrice(
      canonicalMillicents,
      [rule],
      {
        at,
        quantity: rule.minQuantity ?? 1,
        cumulativeQuantity: null,
        // La portée vise cet article nommément : les deux clés pointent dessus,
        // et la catégorie ne sert pas — aucune règle de famille n'est lue ici.
        variantSku: sku,
        productSku: sku,
        categoryId: "",
        companyId,
        segmentId: null,
      },
      null,
    );
    return { sku, companyId, unitPriceMillicents: resolved.finalMillicents };
  }
}
