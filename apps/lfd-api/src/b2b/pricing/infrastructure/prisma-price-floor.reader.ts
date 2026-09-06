import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PRICING_CACHE_KEYS, PricingMaterialsCache } from "./pricing-materials.cache.js";
import { PriceFloorReader } from "../domain/ports/price-floor.reader.js";
import { unarchivedAt } from "./archived-at.js";
import { floorFromRow } from "./price-rows.js";
import type { PricingScopes } from "../domain/pricing-scopes.js";
import type { ScopedPriceFloor } from "../domain/price-rule.js";

@Injectable()
export class PrismaPriceFloorReader extends PriceFloorReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  /** Élague sur la portée — le seul axe qu'un plancher possède. */
  /**
   * 🔴 **Ni fenêtre ni audience** — un plancher ne porte pas son cycle de vie,
   * et c'est une décision, pas un oubli (cf. `ScopedPriceFloor`). Seule la
   * portée le sélectionne, donc une lecture de panier n'a qu'un `IN` à faire.
   */
  async inScopes(_scopes: PricingScopes): Promise<ScopedPriceFloor[]> {
    // La table entière, gardée entre deux écritures — cf.
    // `pricing-materials.cache.ts`. Un plancher n'ayant NI fenêtre NI audience,
    // il ne reste rien à trier par requête : la portée est rejugée par l'index
    // de `pricing-materials.ts`, et le paramètre ne sert plus qu'à tenir la
    // signature du port.
    // Copié : le port rend un tableau MUTABLE, et rendre la liste du cache
    // laisserait un appelant la trier sur place — donc modifier ce que les
    // requêtes suivantes liront. Un cache qu'on peut écrire n'est pas un cache.
    return [...(await this.cache.of(PRICING_CACHE_KEYS.floors, () => this.unarchived()))];
  }

  /** Toutes les limites vivantes — l'unique lecture que le cache retient. */
  private async unarchived(): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({ where: { archivedAt: null } });
    return rows.map(floorFromRow);
  }

  /** « Archivée » se lit **à l'instant demandé** : cf. {@link unarchivedAt}. */
  async listAll(at: Date): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({ where: unarchivedAt(at) });
    return rows.map(floorFromRow);
  }
}
