import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../journal/pim-journal.js";
import { referenceFrom } from "../../../../platform/id/reference.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  CatalogRevisionRepository,
  type RevisionPublication,
  type RevisionRecord,
} from "../domain/ports/catalog-revision.repository.js";
import { RevisionHashAlreadyTakenError } from "../domain/errors/revision-errors.js";
import type { RevisionIndex } from "../domain/diff.js";
import { toJsonObject, type JsonObject } from "../domain/fingerprint.js";
import type { Revision } from "../domain/revision.js";

/** Le préfixe des révisions — `P` aux produits, `C` aux sociétés, `R` ici. */
const REVISION_PREFIX = "R";

/**
 * Violation d'unicité Prisma (`P2002`) — **duck-typée**, sans importer les
 * classes du client.
 *
 * Le motif est celui du dépôt (`prisma-appointment.repository.ts`,
 * `customer-principal.resolver.ts`) : importer `PrismaClientKnownRequestError`
 * ferait entrer une classe du client dans le seul fichier qui a le droit de la
 * connaître, pour y gagner un `instanceof` que la forme donne déjà.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}

@Injectable()
export class PrismaCatalogRevisionRepository extends CatalogRevisionRepository {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly ids: PimIdGenerator,
  ) {
    super();
  }

  /**
   * 🔴 **On part de la PUBLICATION, pas de l'ancre**, et l'ordre de lecture est
   * tout le sujet.
   *
   * La rédaction évidente — les ancres qui ont `some` publication réussie,
   * triées par `takenAt` — rejoue exactement le bug qu'on ferme. Après un
   * aller-retour A → B → A, l'ancre A reçoit une seconde publication mais son
   * `takenAt` reste le plus ancien : le tri par pose rendrait **B**, et l'écran
   * annoncerait des changements sur un catalogue qu'on vient de republier
   * entier. C'est le tableau du §4.3, à un tri près.
   *
   * D'où deux requêtes plutôt qu'une jointure triée : la dernière publication
   * réussie, puis l'ancre qu'elle désigne. La table est petite — quelques lignes
   * par push — et la seconde lecture est une clé primaire.
   *
   * Les DEUX filtres, et pas seulement `outcome` : une simulation s'inscrit
   * aussi en `sent`, délibérément — c'est ce qui distingue « jamais tenté » de
   * « tenté à blanc ». Oublier `mode` ferait d'un dry-run la référence du
   * catalogue.
   */
  async lastPublished(): Promise<RevisionRecord | null> {
    const publication = await this.prisma.catalogRevisionPublication.findFirst({
      where: { mode: "live", outcome: "sent" },
      orderBy: { publishedAt: "desc" },
      select: { revisionId: true },
    });
    if (publication === null) {
      return null;
    }
    const row = await this.prisma.catalogRevision.findUnique({
      where: { id: publication.revisionId },
      include: { _count: { select: { items: true } } },
    });
    return row === null ? null : toRecord(row);
  }

  /**
   * `findUnique` : l'empreinte est l'**identité** de l'ancre depuis que la base
   * la tient (`catalog_revision_hash_key`). Il ne peut y en avoir qu'une, donc
   * il n'y a plus de tri à choisir — et le choix qu'il fallait faire quand la
   * colonne n'était pas unique (la plus ANCIENNE fait foi) est devenu sans objet
   * plutôt que d'être devenu tacite.
   */
  async byHash(hash: string): Promise<RevisionRecord | null> {
    const row = await this.prisma.catalogRevision.findUnique({
      where: { hash },
      include: { _count: { select: { items: true } } },
    });
    return row === null ? null : toRecord(row);
  }

  async list(limit: number): Promise<readonly RevisionRecord[]> {
    const rows = await this.prisma.catalogRevision.findMany({
      orderBy: { takenAt: "desc" },
      take: limit,
      include: { _count: { select: { items: true } } },
    });
    return rows.map((row) => toRecord(row));
  }

  async byReference(reference: string): Promise<RevisionRecord | null> {
    const row = await this.prisma.catalogRevision.findUnique({
      where: { reference },
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

  async recordPublication(publication: RevisionPublication): Promise<void> {
    await this.prisma.catalogRevisionPublication.create({
      data: {
        id: this.ids.next(),
        revisionId: publication.revisionId,
        channel: publication.channel,
        mode: publication.mode,
        outcome: publication.outcome,
        // `report` traverse tel quel : c'est ce que la destination a répondu, et
        // le réinterpréter ici ferait dire à l'ancre autre chose que ce qui a
        // été reçu.
        ...(publication.report === undefined || publication.report === null
          ? {}
          : { report: toJsonObject(asRecord(publication.report)) }),
        projectionFingerprint: publication.projectionFingerprint,
        publishedAt: publication.publishedAt,
        publishedBy: publication.publishedBy,
      },
    });
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
  ): Promise<{ readonly id: string; readonly reference: string }> {
    // Le laissez-passer n'ouvre rien ici : une révision ne modifie aucune table
    // du catalogue, elle le PHOTOGRAPHIE. Il est exigé quand même — c'est ce qui
    // garantit que le fait est tracé avant que la ligne existe.
    void ticket;
    const id = this.ids.next();
    // Dérivée de l'identifiant, pas tirée d'un compteur : lire « le dernier
    // numéro » pour ajouter un est une course, et deux publications simultanées
    // calculaient le même.
    const reference = referenceFrom(REVISION_PREFIX, id);
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
    // La violation d'unicité est TRADUITE ici, et nulle part ailleurs : le
    // handler ne peut pas lire un code d'erreur de la base sans savoir quelle
    // base il a en face. Ce refus n'arrive qu'à la course — deux pushs
    // simultanés qui écrivent la même empreinte —, et l'appelant a alors une
    // suite honnête : rattraper l'ancre du gagnant.
    await this.prisma.catalogRevision
      .create({
        data: {
          id,
          reference,
          label: record.label,
          hash: record.hash,
          header: { ...revision.header },
          takenAt: record.takenAt,
          takenBy: record.takenBy,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new RevisionHashAlreadyTakenError(record.hash);
        }
        throw error;
      });
    await this.prisma.catalogRevisionItem.createMany({
      data: revision.items.map((item) => ({
        revisionId: id,
        sku: item.sku,
        contentHash: item.hash,
      })),
    });
    return { id, reference };
  }
}

/** Ligne + compte → enregistrement. Le compte vient de la base, pas d'une lecture. */
function toRecord(row: {
  id: string;
  reference: string;
  label: string | null;
  hash: string;
  takenAt: Date;
  takenBy: string;
  _count: { items: number };
}): RevisionRecord {
  return {
    id: row.id,
    reference: row.reference,
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
  if (!isRecord(header)) {
    return null;
  }
  const value: unknown = header["proRatioBp"];
  return typeof value === "number" ? value : null;
}

/** Un payload stocké est un objet — sinon la ligne a été écrite hors de ce code. */
function asRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new TypeError("Un payload de révision stocké n'est pas un objet.");
  }
  return { ...payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
