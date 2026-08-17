import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PriceFloorReader } from "../domain/ports/price-floor.reader.js";
import { CorruptedPriceFloorError } from "../domain/pricing-errors.js";
import type { PriceScopeType, PricingContext, ScopedPriceFloor } from "../domain/price-rule.js";

/** La ligne telle que Prisma la rend — discriminants en `String`, donc à vérifier. */
interface FloorRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly mode: string;
  readonly value: number;
}

const SCOPE_TYPES: readonly PriceScopeType[] = ["global", "category", "product", "variant"];

@Injectable()
export class PrismaPriceFloorReader extends PriceFloorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Élague sur la portée — le seul axe qu'un plancher possède. */
  async candidatesFor(context: PricingContext): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({
      where: {
        OR: [
          { scopeType: "global" },
          { scopeType: "category", scopeId: context.categoryId },
          { scopeType: "product", scopeId: context.productSku },
          { scopeType: "variant", scopeId: context.variantSku },
        ],
      },
    });
    return rows.map(toDomain);
  }

  async listAll(): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany();
    return rows.map(toDomain);
  }
}

/**
 * Ligne → plancher de domaine.
 *
 * Une ligne illisible **lève** au lieu d'être ignorée, et l'arbitrage est plus
 * net encore que pour les règles : ignorer un plancher, c'est retirer la
 * protection exactement là où quelqu'un avait jugé qu'elle était nécessaire.
 */
function toDomain(row: FloorRow): ScopedPriceFloor {
  const scopeType = SCOPE_TYPES.find((candidate) => candidate === row.scopeType);
  if (scopeType === undefined) {
    throw new CorruptedPriceFloorError(row.id, `portée inattendue « ${row.scopeType} »`);
  }
  if (row.mode !== "percent" && row.mode !== "amount") {
    throw new CorruptedPriceFloorError(row.id, `unité inconnue « ${row.mode} »`);
  }
  return {
    id: row.id,
    scope: { type: scopeType, id: row.scopeId },
    floor:
      row.mode === "percent"
        ? { mode: "percent", bp: row.value }
        : { mode: "amount", cents: row.value },
  };
}
