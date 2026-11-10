import { shopCartPayloadSchema, type ShopCartPayload, type ShopCartView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { ShopCartRepository } from "../domain/ports/shop-cart.repository.js";

/** Une ligne de `shop_carts` telle qu'on la relit. */
interface CartRow {
  readonly payload: Prisma.JsonValue;
  readonly updatedAt: Date;
}

/** Ce que rend l'écriture en SQL brut : les noms de colonnes, pas du modèle. */
interface WrittenRow {
  readonly updated_at: Date;
}

/**
 * Le panier en Postgres, dans une colonne `jsonb`, un par personne et par
 * espace de travail.
 *
 * **Validé à la relecture, pas seulement à l'écriture.** Le contenu d'une
 * colonne JSON n'a aucune garantie de forme : un panier écrit par une version
 * précédente de la boutique repasse par le schéma. Un panier illisible est rendu
 * `null` — et ce n'est pas une perte, parce que le navigateur du client tient de
 * toute façon sa propre copie, qui sera versée à la fusion suivante.
 */
@Injectable()
export class PrismaShopCartRepository extends ShopCartRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async find(userId: string, companyId: string | null): Promise<ShopCartView | null> {
    // `findFirst` et non `findUnique` : l'unicité composée n'est pas déclarée au
    // schéma (cf. le modèle). `companyId: null` se traduit en `IS NULL`.
    const row = await this.prisma.shopCart.findFirst({
      where: { userId, companyId },
      select: { payload: true, updatedAt: true },
    });
    return row === null ? null : toView(row);
  }

  /**
   * **`INSERT … ON CONFLICT` en SQL brut**, et pas un `upsert` Prisma : son
   * `where` exige une unicité déclarée, et Prisma n'accepte pas `null` dans une
   * unicité composée — le panier perso ne s'écrirait pas. Un `findFirst` suivi
   * d'un `create` lèverait une violation d'unicité sur deux `PUT` simultanés (la
   * reprise et l'écriture amortie du front). L'arbitre est l'index
   * `shop_carts_user_company_unique`, `NULLS NOT DISTINCT` : deux paniers perso
   * s'y heurtent comme deux paniers d'une même société.
   *
   * Les deux horodatages viennent du `Clock` : `@updatedAt` est posé par le
   * client Prisma, que le SQL brut contourne, et `now()` lirait l'horloge de la
   * base plutôt que l'instant de la requête.
   */
  async save(
    userId: string,
    companyId: string | null,
    payload: ShopCartPayload,
  ): Promise<ShopCartView> {
    const now = this.clock.now();
    const [row] = await this.prisma.$queryRaw<WrittenRow[]>`
      INSERT INTO "public"."shop_carts"
        ("id", "user_id", "company_id", "payload", "created_at", "updated_at")
      VALUES
        (${this.ids.next()}, ${userId}, ${companyId}, ${JSON.stringify(payload)}::jsonb, ${now}, ${now})
      ON CONFLICT ("user_id", "company_id")
      DO UPDATE SET "payload" = EXCLUDED."payload", "updated_at" = EXCLUDED."updated_at"
      RETURNING "updated_at"`;
    // La vue est construite depuis ce qu'on VIENT d'écrire, sans le relire :
    // repasser par `toView` rendrait un type nullable pour un cas impossible.
    return { ...payload, savedAt: (row?.updated_at ?? now).toISOString() };
  }
}

/** `null` quand le contenu stocké n'a plus la forme attendue — cf. la classe. */
function toView(row: CartRow): ShopCartView | null {
  const parsed = shopCartPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    return null;
  }
  return { ...parsed.data, savedAt: row.updatedAt.toISOString() };
}
