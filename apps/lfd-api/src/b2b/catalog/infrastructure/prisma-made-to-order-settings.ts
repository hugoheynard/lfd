import { Injectable } from "@nestjs/common";
import type { ReservedVisibility } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MadeToOrderSettings } from "../domain/ports/made-to-order-settings.js";

/** Les deux colonnes de ce réglage, et la valeur que la base leur donne par défaut. */
const COLUMNS = {
  isMadeToOrder: { sql: Prisma.raw(`"is_made_to_order"`), byDefault: false },
  reservedVisibility: { sql: Prisma.raw(`"reserved_visibility"`), byDefault: "hidden" },
} as const;

type Column = keyof typeof COLUMNS;

/**
 * Le marqueur sur mesure et la visibilité réservée, sur la ligne de décision
 * de l'article (`catalog_item_overrides`).
 *
 * 🔴 **En SQL écrit, pas par `catalogItemOverride.update`** : la colonne
 * `decided_at` y est `@updatedAt`, et le client Prisma la réécrirait — elle
 * dit quand le MASQUAGE ou la mise en avant ont été décidés, pas ce geste-ci
 * (le journal le dit). Les colonnes de l'agrégat ne sont jamais touchées.
 *
 * Une ligne n'est créée que si la valeur posée n'est pas celle du défaut : un
 * article jamais décidé n'a pas de ligne, et démarquer un article qui ne l'a
 * jamais été n'en crée pas une pour rien.
 */
@Injectable()
export class PrismaMadeToOrderSettings extends MadeToOrderSettings {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  setMadeToOrder(sku: string, madeToOrder: boolean, at: Date): Promise<boolean> {
    return this.write("isMadeToOrder", sku, madeToOrder, at);
  }

  setReservedVisibility(sku: string, visibility: ReservedVisibility, at: Date): Promise<boolean> {
    return this.write("reservedVisibility", sku, visibility, at);
  }

  /** Réécrit une ligne existante qui diffère, sinon crée la ligne si la valeur n'est pas le défaut. */
  private async write(
    column: Column,
    sku: string,
    value: boolean | ReservedVisibility,
    at: Date,
  ): Promise<boolean> {
    const { sql, byDefault } = COLUMNS[column];
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE public.catalog_item_overrides SET ${sql} = ${value}
      WHERE "sku" = ${sku} AND ${sql} IS DISTINCT FROM ${value}`);
    if (updated > 0 || value === byDefault) {
      return updated > 0;
    }
    // `decided_at` est NOT NULL sans défaut en base : l'instant du geste, lu
    // sur l'horloge de l'appelant. `decided_by` reste vide — personne n'a
    // décidé de masquage.
    const inserted = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.catalog_item_overrides ("sku", ${sql}, "decided_at")
      VALUES (${sku}, ${value}, ${at})
      ON CONFLICT ("sku") DO NOTHING`);
    return inserted > 0;
  }
}
