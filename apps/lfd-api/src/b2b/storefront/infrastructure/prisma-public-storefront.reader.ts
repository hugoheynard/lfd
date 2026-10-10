import type { PublicStorefrontPageView } from "@lfd/contracts";
import { HOME_PAGE } from "@lfd/storefront-layout";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PublicStorefrontReader } from "../domain/public-storefront.reader.js";
import { StorefrontObject } from "../domain/storefront-object.js";
import { StorefrontPage } from "../domain/storefront-page.js";
import { objectInputOf, pageInputOf } from "./storefront-rows.js";
import { publicObjectView } from "./storefront-views.js";

/**
 * Lecteur Prisma de la page publique d'un rayon (plan, D8) : les objets
 * VIVANTS qui paraissent sur ce rayon, en ordre de lecture, contenus dans
 * leur ordre de défilement. L'accueil (`home`) porte en plus l'image de sa
 * porte — `null` tant que personne ne l'a choisie, et aussi quand il n'a pas
 * de page : l'accueil reste servi, avec sa photo par défaut.
 */
@Injectable()
export class PrismaPublicStorefrontReader extends PublicStorefrontReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pageOf(shelfKey: string): Promise<PublicStorefrontPageView> {
    const page = await this.prisma.storefrontPage.findUnique({ where: { shelfKey } });
    const door = shelfKey === HOME_PAGE ? { pickupDoorImage: null } : {};
    if (page === null) {
      return { rows: 0, objects: [], ...door };
    }
    const state = StorefrontPage.of(pageInputOf(page)).state;
    const objects = await this.prisma.storefrontObject.findMany({
      where: { archivedAt: null, shelves: { some: { shelfKey } } },
      include: { shelves: true, contents: { orderBy: { position: "asc" } } },
      orderBy: [{ row: "asc" }, { col: "asc" }, { id: "asc" }],
    });
    return {
      rows: state.rows,
      ...(shelfKey === HOME_PAGE ? { pickupDoorImage: state.pickupDoorImage } : {}),
      objects: objects.map((row) =>
        publicObjectView(StorefrontObject.of(objectInputOf(row)).state),
      ),
    };
  }
}
