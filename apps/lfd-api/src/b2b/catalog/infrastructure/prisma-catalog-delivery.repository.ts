import { Injectable } from "@nestjs/common";
import { catalogSnapshotSchema } from "@lfd/catalog-sync";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import {
  CatalogDelivery,
  type CatalogDeliveryState,
  type DeliveryStatus,
} from "../domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../domain/ports/catalog-delivery.repository.js";

/** La ligne telle que Prisma la rend. Aucun type `Prisma.*` ne sort d'ici. */
interface DeliveryRow {
  readonly id: string;
  readonly revisionId: string;
  readonly snapshot: unknown;
  readonly fingerprint: string;
  readonly status: string;
  readonly excludedSkus: unknown;
  readonly receivedAt: Date;
  readonly acceptedAt: Date | null;
  readonly acceptedBy: string | null;
}

/**
 * Les trois états connus. Une valeur inattendue **lève** au lieu de retomber sur
 * `pending` : une arrivée close relue comme ouverte se laisserait valider une
 * seconde fois, et poserait une seconde version du même catalogue.
 */
function statusOf(raw: string): DeliveryStatus {
  if (raw === "pending" || raw === "accepted" || raw === "superseded") {
    return raw;
  }
  throw new Error(`État d'arrivée inconnu en base : « ${raw} ».`);
}

/**
 * Le snapshot est **revalidé** à la relecture, par le schéma du fil.
 *
 * Un `jsonb` n'a pas de forme : sans cette passe, une colonne corrompue — une
 * migration ratée, une écriture à la main — remonterait jusqu'aux faits de vente
 * en se faisant passer pour un catalogue. Le coût est une validation Zod par
 * lecture ; le gain est qu'aucune arrivée informe ne devienne un prix.
 */
function snapshotOf(raw: unknown): CatalogDeliveryState["snapshot"] {
  return catalogSnapshotSchema.parse(raw);
}

/** Les SKU écartés : `null` (jamais validée) et `[]` (rien d'écarté) diffèrent. */
function excludedOf(raw: unknown): readonly string[] | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  return Array.isArray(raw) ? raw.filter((sku): sku is string => typeof sku === "string") : null;
}

function toDomain(row: DeliveryRow): CatalogDelivery {
  return CatalogDelivery.from({
    id: row.id,
    revisionId: row.revisionId,
    snapshot: snapshotOf(row.snapshot),
    fingerprint: row.fingerprint,
    status: statusOf(row.status),
    excludedSkus: excludedOf(row.excludedSkus),
    receivedAt: row.receivedAt,
    acceptedAt: row.acceptedAt,
    acceptedBy: row.acceptedBy,
  });
}

@Injectable()
export class PrismaCatalogDeliveryRepository extends CatalogDeliveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async pending(): Promise<CatalogDelivery | null> {
    const row = await this.prisma.catalogDelivery.findFirst({ where: { status: "pending" } });
    return row === null ? null : toDomain(row);
  }

  async byId(id: string): Promise<CatalogDelivery | null> {
    const row = await this.prisma.catalogDelivery.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(delivery: CatalogDelivery): Promise<void> {
    const state = delivery.toPersistence();
    await this.prisma.catalogDelivery.update({
      where: { id: state.id },
      data: {
        status: state.status,
        // `Prisma.DbNull` et non `null` : sur une colonne `jsonb`, `null`
        // désignerait le JSON `null` — une VALEUR — là où l'absence de
        // validation doit rester une absence. C'est la même distinction que
        // `null` contre `[]` côté domaine, et elle se perd ici si on ne la dit
        // pas.
        excludedSkus: state.excludedSkus === null ? Prisma.DbNull : [...state.excludedSkus],
        acceptedAt: state.acceptedAt,
        acceptedBy: state.acceptedBy,
      },
    });
  }

  /**
   * Clore l'arrivée en attente et poser la nouvelle, **dans une transaction**.
   *
   * L'atomicité est une nécessité, pas une élégance : l'index partiel de
   * Postgres n'admet aucune seconde ligne `pending`, donc insérer avant de
   * clore échouerait, et clore avant d'insérer ouvrirait une fenêtre où le
   * catalogue n'a pas d'arrivée du tout. Les deux dans la même transaction, et
   * le problème disparaît.
   */
  async deliver(delivery: CatalogDelivery): Promise<void> {
    const state = delivery.toPersistence();
    await this.uow.run(async () => {
      const waiting = await this.pending();
      if (waiting !== null) {
        waiting.supersede();
        await this.save(waiting);
      }
      await this.prisma.catalogDelivery.create({
        data: {
          id: state.id,
          revisionId: state.revisionId,
          snapshot: state.snapshot,
          fingerprint: state.fingerprint,
          status: state.status,
          receivedAt: state.receivedAt,
        },
      });
    });
  }
}
