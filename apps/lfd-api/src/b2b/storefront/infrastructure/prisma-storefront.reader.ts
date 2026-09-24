import type { StorefrontView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { STOREFRONT_ID } from "../domain/storefront.events.js";
import { StorefrontObject } from "../domain/storefront-object.js";
import { StorefrontReader } from "../domain/storefront.reader.js";
import { StorefrontTemplate } from "../domain/storefront-template.js";
import { objectInputOf, templateInputOf } from "./storefront-rows.js";
import { objectView, templateView } from "./storefront-views.js";

/** Lecteur Prisma de la vitrine pour l'éditeur. Objets archivés exclus. */
@Injectable()
export class PrismaStorefrontReader extends StorefrontReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<StorefrontView> {
    const [head, pages, objects, templates] = await Promise.all([
      this.prisma.storefront.findUnique({ where: { id: STOREFRONT_ID } }),
      this.prisma.storefrontPage.findMany({ orderBy: { shelfKey: "asc" } }),
      this.prisma.storefrontObject.findMany({
        where: { archivedAt: null },
        include: {
          shelves: { orderBy: { shelfKey: "asc" } },
          contents: { orderBy: { position: "asc" } },
        },
        orderBy: [{ row: "asc" }, { col: "asc" }, { id: "asc" }],
      }),
      this.prisma.storefrontTemplate.findMany({ orderBy: { name: "asc" } }),
    ]);
    return {
      revision: head?.revision ?? 0,
      updatedAt: head?.updatedAt.toISOString() ?? null,
      pages: pages.map((page) => ({ shelfKey: page.shelfKey, rows: page.rows })),
      objects: objects.map((row) => objectView(StorefrontObject.of(objectInputOf(row)).state)),
      templates: templates.map((row) =>
        templateView(StorefrontTemplate.of(templateInputOf(row)).state),
      ),
    };
  }
}
