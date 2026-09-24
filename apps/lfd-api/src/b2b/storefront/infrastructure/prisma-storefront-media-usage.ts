import { formatSpec, STOREFRONT_SHAPES } from "@lfd/storefront-layout";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  StorefrontMediaUsage,
  type StorefrontMediaUsageEntry,
} from "../channels/media/storefront-media-usage.js";

/**
 * Adaptateur Prisma du canal « quelles images emploie la vitrine ». Il lit
 * les contenus info des objets NON archivés — les tables de la vitrine, que
 * seul ce contexte lit (`lint:prisma-model-ownership`).
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
    const objectsByUrl = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.imageUrl !== null) {
        const objects = objectsByUrl.get(row.imageUrl) ?? new Set<string>();
        objects.add(row.objectId);
        objectsByUrl.set(row.imageUrl, objects);
      }
    }
    return new Map([...objectsByUrl].map(([url, objects]) => [url, objects.size]));
  }

  async usagesOf(url: string): Promise<readonly StorefrontMediaUsageEntry[]> {
    const rows = await this.prisma.storefrontContent.findMany({
      where: { imageUrl: url, object: { archivedAt: null } },
      select: { objectId: true, title: true, object: { select: { shape: true } } },
      orderBy: [{ objectId: "asc" }, { position: "asc" }],
    });
    const byObject = new Map<string, string>();
    for (const row of rows) {
      if (!byObject.has(row.objectId)) {
        byObject.set(row.objectId, titleOf(row.title) ?? `Objet ${shapeLabel(row.object.shape)}`);
      }
    }
    return [...byObject].map(([objectId, label]) => ({ objectId, label }));
  }
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
