import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PriceFloorReader } from "../domain/ports/price-floor.reader.js";
import { unarchivedAt } from "./archived-at.js";
import { floorFromRow } from "./price-rows.js";
import { scopeFilter } from "./scope-filter.js";
import type { PricingScopes } from "../domain/pricing-scopes.js";
import type { ScopedPriceFloor } from "../domain/price-rule.js";

@Injectable()
export class PrismaPriceFloorReader extends PriceFloorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Élague sur la portée — le seul axe qu'un plancher possède. */
  /**
   * 🔴 **Ni fenêtre ni audience** — un plancher ne porte pas son cycle de vie,
   * et c'est une décision, pas un oubli (cf. `ScopedPriceFloor`). Seule la
   * portée le sélectionne, donc une lecture de panier n'a qu'un `IN` à faire.
   */
  async inScopes(scopes: PricingScopes): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({
      where: {
        // Une limite archivée ne protège plus rien : elle ne doit pas ressortir
        // comme candidate, sinon elle continuerait d'arbitrer des prix.
        archivedAt: null,
        OR: scopeFilter(scopes),
      },
    });
    return rows.map(floorFromRow);
  }

  /** « Archivée » se lit **à l'instant demandé** : cf. {@link unarchivedAt}. */
  async listAll(at: Date): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({ where: unarchivedAt(at) });
    return rows.map(floorFromRow);
  }
}
