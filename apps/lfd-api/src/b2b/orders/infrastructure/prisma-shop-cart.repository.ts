import { shopCartPayloadSchema, type ShopCartPayload, type ShopCartView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShopCartRepository } from "../domain/ports/shop-cart.repository.js";

/** Une ligne de `shop_carts` telle qu'on la relit. */
interface CartRow {
  readonly payload: Prisma.JsonValue;
  readonly updatedAt: Date;
}

/**
 * Le panier en Postgres, dans une colonne `jsonb`.
 *
 * **Validé à la relecture, pas seulement à l'écriture.** Le contenu d'une
 * colonne JSON n'a aucune garantie de forme : un panier écrit par une version
 * précédente de la boutique repasse par le schéma. Un panier illisible est rendu
 * `null` — et ce n'est pas une perte, parce que le navigateur du client tient de
 * toute façon sa propre copie, qui sera versée à la fusion suivante.
 */
@Injectable()
export class PrismaShopCartRepository extends ShopCartRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(userId: string): Promise<ShopCartView | null> {
    const row = await this.prisma.shopCart.findUnique({ where: { userId }, select: SELECT });
    return row === null ? null : toView(row);
  }

  async save(userId: string, payload: ShopCartPayload): Promise<ShopCartView> {
    const row = await this.prisma.shopCart.upsert({
      where: { userId },
      create: { userId, payload },
      update: { payload },
      select: SELECT,
    });
    // La vue est construite depuis ce qu'on VIENT d'écrire, sans le relire :
    // repasser par `toView` rendrait un type nullable pour un cas impossible.
    return { ...payload, savedAt: row.updatedAt.toISOString() };
  }
}

const SELECT = { payload: true, updatedAt: true } as const;

/** `null` quand le contenu stocké n'a plus la forme attendue — cf. la classe. */
function toView(row: CartRow): ShopCartView | null {
  const parsed = shopCartPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    return null;
  }
  return { ...parsed.data, savedAt: row.updatedAt.toISOString() };
}
