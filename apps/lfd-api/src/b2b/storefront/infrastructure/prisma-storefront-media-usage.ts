import { formatSpec, HOME_PAGE, STOREFRONT_SHAPES } from "@lfd/storefront-layout";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  StorefrontMediaUsage,
  type StorefrontMediaUsageEntry,
} from "../channels/media/storefront-media-usage.js";

/** Le libellé de la porte de l'accueil, comme porteur. */
const PICKUP_DOOR_LABEL = "Accueil — porte « Je passe la prendre »";

/**
 * Adaptateur Prisma du canal « quelles images emploie la vitrine ». Il lit
 * les contenus info des objets NON archivés, et l'image de la porte de
 * l'accueil — les tables de la vitrine, que seul ce contexte lit
 * (`lint:prisma-model-ownership`).
 */
@Injectable()
export class PrismaStorefrontMediaUsage extends StorefrontMediaUsage {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (urls.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.storefrontContent.findMany({
      where: { imageUrl: { in: [...urls] }, object: { archivedAt: null } },
      select: { imageUrl: true, objectId: true },
    });
    const doors = await this.prisma.storefrontPage.findMany({
      where: { pickupDoorImageUrl: { in: [...urls] } },
      select: { pickupDoorImageUrl: true, shelfKey: true },
    });
    const carriersByUrl = new Map<string, Set<string>>();
    const add = (url: string | null, carrier: string): void => {
      if (url !== null) {
        const carriers = carriersByUrl.get(url) ?? new Set<string>();
        carriers.add(carrier);
        carriersByUrl.set(url, carriers);
      }
    };
    rows.forEach((row) => add(row.imageUrl, row.objectId));
    doors.forEach((door) => add(door.pickupDoorImageUrl, `page:${door.shelfKey}`));
    return new Map([...carriersByUrl].map(([url, carriers]) => [url, carriers.size]));
  }

  async usagesOf(url: string): Promise<readonly StorefrontMediaUsageEntry[]> {
    const rows = await this.prisma.storefrontContent.findMany({
      where: { imageUrl: url, object: { archivedAt: null } },
      select: {
        objectId: true,
        title: true,
        object: { select: { shape: true, shelves: { where: { shelfKey: HOME_PAGE } } } },
      },
      orderBy: [{ objectId: "asc" }, { position: "asc" }],
    });
    const byObject = new Map<string, string>();
    for (const row of rows) {
      if (!byObject.has(row.objectId)) {
        const onHome = row.object.shelves.length > 0;
        byObject.set(row.objectId, objectLabel(titleOf(row.title), row.object.shape, onHome));
      }
    }
    const doors = await this.prisma.storefrontPage.count({ where: { pickupDoorImageUrl: url } });
    return [
      ...(doors > 0 ? [{ objectId: HOME_PAGE, label: PICKUP_DOOR_LABEL }] : []),
      ...[...byObject].map(([objectId, label]) => ({ objectId, label })),
    ];
  }
}

/**
 * « Galette des rois », « Objet Bande simple » — et, posé sur l'accueil,
 * « Accueil — bannière » : sans le mot, une bannière sans titre ne se
 * retrouverait pas.
 */
function objectLabel(title: string | null, shape: string, onHome: boolean): string {
  if (!onHome) {
    return title ?? `Objet ${shapeLabel(shape)}`;
  }
  return `Accueil — ${title ?? shapeLabel(shape).toLowerCase()}`;
}

/** Le titre français d'un contenu, s'il en a un. */
function titleOf(title: unknown): string | null {
  if (typeof title !== "object" || title === null || !("fr" in title)) {
    return null;
  }
  const fr = title.fr;
  return typeof fr === "string" && fr.trim() !== "" ? fr : null;
}

/** « Bande simple » — le nom de la forme, ou sa clé si la table ne la connaît plus. */
function shapeLabel(shape: string): string {
  const known = STOREFRONT_SHAPES.find((candidate) => candidate === shape);
  return known === undefined ? shape : formatSpec(known).label;
}
