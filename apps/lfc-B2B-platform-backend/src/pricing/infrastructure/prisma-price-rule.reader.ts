import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PriceRuleReader } from "../domain/ports/price-rule.reader.js";
import { ruleFromRow } from "./price-rows.js";
import type { PriceRule, PricingContext } from "../domain/price-rule.js";

@Injectable()
export class PrismaPriceRuleReader extends PriceRuleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Élague sur ce que SQL sait faire — fenêtre, portée, audience — et laisse la
   * spécificité au domaine.
   *
   * Le palier de quantité n'est **pas** filtré ici alors qu'il pourrait l'être :
   * la fonction pure le fait, et deux endroits qui filtrent la même chose sont
   * deux endroits à corriger le jour où la règle change.
   */
  async candidatesFor(context: PricingContext): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: {
        validFrom: { lte: context.at },
        OR: [{ validTo: null }, { validTo: { gt: context.at } }],
        AND: [
          {
            OR: [
              { scopeType: "global" },
              { scopeType: "category", scopeId: context.categoryId },
              { scopeType: "product", scopeId: context.productSku },
              { scopeType: "variant", scopeId: context.variantSku },
            ],
          },
          { OR: audienceFilter(context) },
        ],
      },
    });
    return rows.map(ruleFromRow);
  }

  /** Tout ce qui est posé, expiré compris — l'écran doit pouvoir le rouvrir. */
  async listAll(): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({
      orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
    });
    return rows.map(ruleFromRow);
  }
}

/**
 * Une commande **sans entreprise** (parcours zéro friction) ne prend que les
 * règles ouvertes à tous. Construire le filtre plutôt que d'écrire trois `OR`
 * inconditionnels évite de demander à Postgres `audience_id = NULL`, qui ne
 * correspond jamais et ferait passer la règle pour absente au lieu d'inapplicable.
 */
function audienceFilter(context: PricingContext): { audienceType: string; audienceId?: string }[] {
  const clauses: { audienceType: string; audienceId?: string }[] = [{ audienceType: "all" }];
  if (context.segmentId !== null) {
    clauses.push({ audienceType: "segment", audienceId: context.segmentId });
  }
  if (context.companyId !== null) {
    clauses.push({ audienceType: "company", audienceId: context.companyId });
  }
  return clauses;
}
