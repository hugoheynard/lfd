import type { PublicStorefrontPageView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PublicStorefrontReader } from "../domain/public-storefront.reader.js";
import { StorefrontObject } from "../domain/storefront-object.js";
import { objectInputOf } from "./storefront-rows.js";
import { publicObjectView } from "./storefront-views.js";

/**
 * Lecteur Prisma de la page publique d'un rayon (plan, D8) : les objets
 * VIVANTS qui paraissent sur ce rayon, en ordre de lecture, contenus dans
 * leur ordre de défilement.
 */
@Injectable()
export class PrismaPublicStorefrontReader extends PublicStorefrontReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pageOf(shelfKey: string): Promise<PublicStorefrontPageView> {
    const page = await this.prisma.storefrontPage.findUnique({ where: { shelfKey } });
    if (page === null) {
      return { rows: 0, objects: [] };
    }
    const objects = await this.prisma.storefrontObject.findMany({
      where: { archivedAt: null, shelves: { some: { shelfKey } } },
      include: { shelves: true, contents: { orderBy: { position: "asc" } } },
      orderBy: [{ row: "asc" }, { col: "asc" }, { id: "asc" }],
    });
    return {
      rows: page.rows,
      objects: objects.map((row) =>
        publicObjectView(StorefrontObject.of(objectInputOf(row)).state),
      ),
    };
  }
}
