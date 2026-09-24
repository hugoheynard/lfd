import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { StorefrontChangedError } from "../domain/storefront-errors.js";
import { STOREFRONT_ID } from "../domain/storefront.events.js";
import type { StorefrontObjectState } from "../domain/storefront-object.js";
import { StorefrontRepository } from "../domain/storefront.repository.js";
import { Storefront, type StorefrontWrite } from "../domain/storefront.js";
import {
  contentColumns,
  objectInputOf,
  settingsColumns,
  templateInputOf,
} from "./storefront-rows.js";

/**
 * Adaptateur Prisma de la vitrine.
 *
 * Il ne décide de rien — ni collision, ni bornes : il traduit l'agrégat en
 * lignes, et tient le VERROU (plan, D6). Tout se passe dans la transaction
 * ambiante de l'unité de travail : `PrismaService` est le proxy
 * `transactionalPrisma`, qui y renvoie chaque ordre, `$executeRaw` compris.
 *
 * Les identifiants des contenus sont posés ICI : un contenu est une partie de
 * la valeur de son objet, il disparaît et renaît à chaque enregistrement, et
 * rien ne le référence.
 */
@Injectable()
export class PrismaStorefrontRepository extends StorefrontRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async load(): Promise<Storefront> {
    // Séquentiel et non `Promise.all` : dans une transaction interactive, les
    // ordres passent de toute façon un par un sur la même connexion.
    const head = await this.prisma.storefront.findUnique({ where: { id: STOREFRONT_ID } });
    const pages = await this.prisma.storefrontPage.findMany({ orderBy: { shelfKey: "asc" } });
    const objects = await this.prisma.storefrontObject.findMany({
      where: { archivedAt: null },
      include: { shelves: true, contents: { orderBy: { position: "asc" } } },
      orderBy: [{ row: "asc" }, { col: "asc" }, { id: "asc" }],
    });
    const templates = await this.prisma.storefrontTemplate.findMany({ orderBy: { name: "asc" } });
    return Storefront.reconstitute({
      revision: head?.revision ?? 0,
      updatedAt: head?.updatedAt ?? null,
      pages: pages.map((page) => ({ shelfKey: page.shelfKey, rows: page.rows })),
      objects: objects.map(objectInputOf),
      templates: templates.map(templateInputOf),
    });
  }

  async save(storefront: Storefront): Promise<void> {
    const state = storefront.toPersistence();
    await this.lock(state);
    await this.replacePages(state);
    await this.replaceTemplates(state);
    for (const object of state.objects) {
      await this.writeObject(object);
    }
    if (state.archivedObjectIds.length > 0) {
      await this.prisma.storefrontObject.updateMany({
        where: { id: { in: [...state.archivedObjectIds] }, archivedAt: null },
        data: { archivedAt: state.updatedAt },
      });
    }
  }

  /**
   * 🔴 **Le verrou, en UN ordre SQL** (D6) — le premier de la transaction.
   *
   * Deux enregistrements concurrents sur la même révision : le premier prend
   * le verrou de ligne ; le second attend, puis relit la ligne à jour, et son
   * `WHERE revision = attendue` ne vaut plus rien — zéro ligne. Comparer dans
   * le handler les aurait laissés passer tous les deux.
   *
   * ⚠️ `RETURNING` : une vitrine ABSENTE s'insère en révision 1 quelle que
   * soit la révision annoncée. Si l'éditeur n'annonçait pas 0, c'est qu'il
   * croyait à une vitrine qui n'existe plus ; le refus lève, et la transaction
   * emporte la ligne insérée.
   */
  private async lock(state: StorefrontWrite): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ readonly revision: number }[]>`
      INSERT INTO "public"."storefront" ("id", "revision", "updated_at", "updated_by_staff_id")
      VALUES (${STOREFRONT_ID}, 1, ${state.updatedAt}, ${state.updatedByStaffId})
      ON CONFLICT ("id") DO UPDATE
        SET "revision" = "storefront"."revision" + 1,
            "updated_at" = EXCLUDED."updated_at",
            "updated_by_staff_id" = EXCLUDED."updated_by_staff_id"
        WHERE "storefront"."revision" = ${state.expectedRevision}::int
      RETURNING "revision"`;
    if (rows[0]?.revision !== state.revision) {
      const current = await this.prisma.storefront.findUnique({
        where: { id: STOREFRONT_ID },
        select: { updatedAt: true },
      });
      throw new StorefrontChangedError(rows.length === 0 ? (current?.updatedAt ?? null) : null);
    }
  }

  private async replacePages(state: StorefrontWrite): Promise<void> {
    await this.prisma.storefrontPage.deleteMany({});
    await this.prisma.storefrontPage.createMany({ data: [...state.pages] });
  }

  /** Remplacés en bloc : le nom est UNIQUE, et deux gabarits peuvent échanger leurs noms. */
  private async replaceTemplates(state: StorefrontWrite): Promise<void> {
    await this.prisma.storefrontTemplate.deleteMany({});
    await this.prisma.storefrontTemplate.createMany({
      data: state.templates.map((template) => ({
        id: template.id,
        name: template.name,
        nameKey: template.nameKey,
        description: template.description,
        ...settingsColumns(template.settings),
      })),
    });
  }

  /** L'objet, puis ses parties — rayons et contenus — réécrites en bloc. */
  private async writeObject(object: StorefrontObjectState): Promise<void> {
    const columns = { ...settingsColumns(object.settings), col: object.column, row: object.row };
    await this.prisma.storefrontObject.upsert({
      where: { id: object.id },
      create: { id: object.id, ...columns },
      update: columns,
    });
    await this.prisma.storefrontObjectShelf.deleteMany({ where: { objectId: object.id } });
    await this.prisma.storefrontContent.deleteMany({ where: { objectId: object.id } });
    await this.prisma.storefrontObjectShelf.createMany({
      data: object.shelves.map((shelfKey) => ({ objectId: object.id, shelfKey })),
    });
    await this.prisma.storefrontContent.createMany({
      data: object.contents.map((content, position) => ({
        id: `sfc_${this.ids.next()}`,
        objectId: object.id,
        position,
        ...contentColumns(content),
      })),
    });
  }
}
