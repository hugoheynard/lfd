import { Injectable } from "@nestjs/common";
import type { MercurialeBenchmarkView } from "@lfd/contracts";

import { PrismaService } from "../../../infra/database/prisma.service.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { Clock } from "../../../infra/time/clock.js";
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
 * facture**. Une mercuriale peut être posée en `replace` (un prix) comme en
 * `alter` (une remise sur le canonique) : lire `amountCents` ignorerait la
 * seconde forme, et l'écran comparerait des prix négociés à des remises.
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
   * Rien quand le catalogue ne connaît plus l'article : sans tarif d'entrée, une
   * mercuriale en `alter` n'a pas de prix calculable, et la faire disparaître est
   * plus honnête que de lui en inventer un.
   */
  private observationOf(
    row: Parameters<typeof ruleFromRow>[0] & { scopeId: string | null; audienceId: string | null },
    catalogue: Awaited<ReturnType<ProductCatalogReader["resolveMany"]>>,
    at: Date,
  ): NegotiatedPrice | null {
    const sku = row.scopeId;
    const companyId = row.audienceId;
    const canonicalCents = sku === null ? undefined : catalogue.get(sku)?.unitPriceCents;
    if (sku === null || companyId === null || canonicalCents === undefined) {
      return null;
    }
    const rule = ruleFromRow(row);
    const resolved = resolvePrice(
      canonicalCents,
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
    return { sku, companyId, unitPriceCents: resolved.finalCents };
  }
}
