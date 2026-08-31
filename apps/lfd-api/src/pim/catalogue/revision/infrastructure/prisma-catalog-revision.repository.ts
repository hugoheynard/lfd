import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../journal/pim-journal.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  CatalogRevisionRepository,
  type RevisionRecord,
} from "../domain/ports/catalog-revision.repository.js";
import type { RevisionIndex } from "../domain/diff.js";
import { toJsonObject, type JsonObject } from "../domain/fingerprint.js";
import type { Revision } from "../domain/revision.js";

@Injectable()
export class PrismaCatalogRevisionRepository extends CatalogRevisionRepository {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly ids: PimIdGenerator,
  ) {
    super();
  }

  async latest(): Promise<RevisionRecord | null> {
    const row = await this.prisma.catalogRevision.findFirst({
      orderBy: { version: "desc" },
      include: { _count: { select: { items: true } } },
    });
    return row === null ? null : toRecord(row);
  }

  async list(limit: number): Promise<readonly RevisionRecord[]> {
    const rows = await this.prisma.catalogRevision.findMany({
      orderBy: { version: "desc" },
      take: limit,
      include: { _count: { select: { items: true } } },
    });
    return rows.map((row) => toRecord(row));
  }

  async byVersion(version: number): Promise<RevisionRecord | null> {
    const row = await this.prisma.catalogRevision.findUnique({
      where: { version },
      include: { _count: { select: { items: true } } },
    });
    return row === null ? null : toRecord(row);
  }

  /**
   * L'index d'une révision : une empreinte par SKU, sans un seul payload.
   *
   * `select` sur les deux colonnes de l'appartenance — la table qui porte la clé
   * et non le contenu. C'est elle qui permet de comparer mille articles en une
   * requête légère.
   */
  async indexOf(revisionId: string): Promise<RevisionIndex> {
    const [items, revision] = await Promise.all([
      this.prisma.catalogRevisionItem.findMany({
        where: { revisionId },
        select: { sku: true, contentHash: true },
      }),
      this.prisma.catalogRevision.findUnique({
        where: { id: revisionId },
        select: { header: true },
      }),
    ]);
    return {
      hashBySku: new Map(items.map((item) => [item.sku, item.contentHash])),
      proRatioBp: ratioOf(revision?.header),
    };
  }

  async payloadsOf(
    revisionId: string,
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, JsonObject>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogRevisionItem.findMany({
      where: { revisionId, sku: { in: [...skus] } },
      include: { content: { select: { payload: true } } },
    });
    return new Map(rows.map((row) => [row.sku, toJsonObject(asRecord(row.content.payload))]));
  }

  async save(
    record: Omit<RevisionRecord, "id">,
    revision: Revision,
    ticket: WriteTicket,
  ): Promise<string> {
    // Le laissez-passer n'ouvre rien ici : une révision ne modifie aucune table
    // du catalogue, elle le PHOTOGRAPHIE. Il est exigé quand même — c'est ce qui
    // garantit que le fait est tracé avant que la ligne existe.
    void ticket;
    const id = this.ids.next();
    // Trois écritures SÉQUENTIELLES, sans `$transaction` : l'atomicité vient de
    // l'unité de travail du handler, qui englobe déjà la trace du journal. En
    // ouvrir une seconde ici serait une transaction imbriquée — que Prisma ne
    // sait pas faire — et surtout la trace tomberait hors du même tout.
    //
    // `skipDuplicates` EST le magasin partagé : un contenu déjà connu n'est pas
    // réécrit, et deux articles identiques d'une même capture n'entrent qu'une
    // fois.
    await this.prisma.catalogContent.createMany({
      data: revision.items.map((item) => ({ hash: item.hash, payload: item.payload })),
      skipDuplicates: true,
    });
    await this.prisma.catalogRevision.create({
      data: {
        id,
        version: record.version,
        label: record.label,
        hash: record.hash,
        header: { ...revision.header },
        takenAt: record.takenAt,
        takenBy: record.takenBy,
      },
    });
    await this.prisma.catalogRevisionItem.createMany({
      data: revision.items.map((item) => ({
        revisionId: id,
        sku: item.sku,
        contentHash: item.hash,
      })),
    });
    return id;
  }
}

/** Ligne + compte → enregistrement. Le compte vient de la base, pas d'une lecture. */
function toRecord(row: {
  id: string;
  version: number;
  label: string | null;
  hash: string;
  takenAt: Date;
  takenBy: string;
  _count: { items: number };
}): RevisionRecord {
  return {
    id: row.id,
    version: row.version,
    label: row.label,
    hash: row.hash,
    takenAt: row.takenAt,
    takenBy: row.takenBy,
    articles: row._count.items,
  };
}

/**
 * Le rapport lu dans l'en-tête stocké.
 *
 * Défensif à la lecture parce que la colonne est du `Json` : une ancre écrite
 * par une version antérieure du format n'a pas à faire tomber un écran. Absent
 * ou illisible ⇒ `null`, qui est déjà la valeur de « jamais réglé ».
 */
function ratioOf(header: unknown): number | null {
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    return null;
  }
  const value = Reflect.get(header, "proRatioBp");
  return typeof value === "number" ? value : null;
}

/** Un payload stocké est un objet — sinon la ligne a été écrite hors de ce code. */
function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("Un payload de révision stocké n'est pas un objet.");
  }
  return { ...payload };
}
