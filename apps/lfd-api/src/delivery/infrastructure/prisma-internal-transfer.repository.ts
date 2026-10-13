import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type HeldTransferItem,
  InternalTransfer,
  type TransferItem,
} from "../domain/entities/internal-transfer.js";
import {
  InternalTransferCorruptedError,
  InternalTransferStaleError,
} from "../domain/errors/internal-transfer-errors.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import {
  InternalTransfersReader,
  TransferredOrdersReader,
  type UnplacedTransferRow,
} from "../domain/ports/internal-transfers.reader.js";

const TRANSFER_INCLUDE = {
  items: { orderBy: [{ attachedAt: "asc" as const }, { id: "asc" as const }] },
  manifest: { orderBy: [{ itemId: "asc" as const }, { sku: "asc" as const }] },
};

interface TransferRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly siteId: string;
  readonly siteLabel: string;
  readonly departedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: readonly ItemRow[];
  readonly manifest: readonly {
    readonly itemId: string;
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
}

interface ItemRow {
  readonly id: string;
  readonly kind: "order" | "refill";
  readonly orderId: string | null;
  readonly refillId: string | null;
  readonly attachedAt: Date;
}

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * **Adaptateur Prisma du transfert interne** (plan du transfert interne,
 * lot T1). SEUL écrivain de `delivery_internal_transfer`,
 * `delivery_internal_transfer_item` et `delivery_internal_transfer_manifest_line`.
 * Rien n'est jamais supprimé : un élément ajouté reste, le manifeste s'écrit
 * une fois, au départ.
 *
 * La version : un transfert changé n'est écrit que si la base porte encore la
 * version lue (`updateMany … WHERE version = lue`) — un départ et un ajout
 * concurrents ne s'écrasent pas.
 */
@Injectable()
export class PrismaInternalTransferRepository extends InternalTransferRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<InternalTransfer | null> {
    const row = await this.prisma.deliveryInternalTransfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    return row === null ? null : toDomain(row);
  }

  async plannedOf(serviceDay: string, siteId: string): Promise<readonly InternalTransfer[]> {
    const rows = await this.prisma.deliveryInternalTransfer.findMany({
      where: { serviceDay, siteId, departedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: TRANSFER_INCLUDE,
    });
    return rows.map(toDomain);
  }

  async holderOf(item: TransferItem): Promise<string | null> {
    const found = await this.prisma.deliveryInternalTransferItem.findFirst({
      where:
        item.kind === "order"
          ? { kind: "order", orderId: item.orderId }
          : { kind: "refill", refillId: item.refillId },
      select: { transferId: true },
    });
    return found?.transferId ?? null;
  }

  async save(transfer: InternalTransfer): Promise<void> {
    const snapshot = transfer.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      if (transfer.loadedVersion === null) {
        await tx.deliveryInternalTransfer.create({
          data: {
            id: snapshot.id,
            serviceDay: snapshot.serviceDay,
            siteId: snapshot.siteId,
            siteLabel: snapshot.siteLabel,
            departedAt: snapshot.departedAt,
            version: snapshot.version,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          },
        });
      } else {
        const written = await tx.deliveryInternalTransfer.updateMany({
          where: { id: snapshot.id, version: transfer.loadedVersion },
          data: {
            departedAt: snapshot.departedAt,
            version: snapshot.version,
            updatedAt: snapshot.updatedAt,
          },
        });
        if (written.count === 0) {
          throw new InternalTransferStaleError(snapshot.siteLabel);
        }
      }
      // Les éléments et le manifeste ne font que s'ajouter : on n'écrit que
      // ce qui manque, et la clé primaire refuse un doublon.
      await tx.deliveryInternalTransferItem.createMany({
        data: snapshot.items.map((item) => ({
          id: item.id,
          transferId: snapshot.id,
          ...itemColumns(item),
          attachedAt: item.attachedAt,
        })),
        skipDuplicates: true,
      });
      await tx.deliveryInternalTransferManifestLine.createMany({
        data: snapshot.manifest.map((line) => ({ transferId: snapshot.id, ...line })),
        skipDuplicates: true,
      });
    });
  }
}

/** Les lectures du transfert : ce qui reste à placer, un transfert à relire. */
@Injectable()
export class PrismaInternalTransfersReader extends InternalTransfersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unplacedOn(serviceDay: string): Promise<readonly UnplacedTransferRow[]> {
    return this.prisma.deliveryInternalTransfer.findMany({
      where: {
        serviceDay,
        departedAt: null,
        items: { some: { kind: "order" } },
        stops: { none: LIVE_STOP },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, siteId: true },
    });
  }

  async byId(id: string): Promise<InternalTransfer | null> {
    const row = await this.prisma.deliveryInternalTransfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    return row === null ? null : toDomain(row);
  }
}

/** Les commandes portées par un transfert, pour la déclaration des bacs. */
@Injectable()
export class PrismaTransferredOrdersReader extends TransferredOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async transferredAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryInternalTransferItem.findMany({
      where: { kind: "order", orderId: { in: [...orderIds] } },
      select: { orderId: true },
    });
    return new Set(rows.flatMap((row) => (row.orderId === null ? [] : [row.orderId])));
  }
}

function itemColumns(item: TransferItem): {
  readonly kind: "order" | "refill";
  readonly orderId: string | null;
  readonly refillId: string | null;
} {
  return item.kind === "order"
    ? { kind: "order", orderId: item.orderId, refillId: null }
    : { kind: "refill", orderId: null, refillId: item.refillId };
}

/** @throws {InternalTransferCorruptedError} un élément dont le genre contredit ses colonnes. */
function itemOf(transferId: string, row: ItemRow): HeldTransferItem {
  if (row.kind === "order" && row.orderId !== null) {
    return { kind: "order", orderId: row.orderId, id: row.id, attachedAt: row.attachedAt };
  }
  if (row.kind === "refill" && row.refillId !== null) {
    return { kind: "refill", refillId: row.refillId, id: row.id, attachedAt: row.attachedAt };
  }
  throw new InternalTransferCorruptedError(transferId, `élément ${row.id} sans sujet`);
}

function toDomain(row: TransferRow): InternalTransfer {
  return InternalTransfer.restore({
    id: row.id,
    serviceDay: row.serviceDay,
    siteId: row.siteId,
    siteLabel: row.siteLabel,
    departedAt: row.departedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => itemOf(row.id, item)),
    manifest: row.manifest.map((line) => ({ ...line })),
  });
}
