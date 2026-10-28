import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type HeldTransferItem,
  InternalTransfer,
  type TransferItem,
} from "../domain/entities/internal-transfer.js";
import { InternalTransferCorruptedError } from "../domain/errors/internal-transfer-errors.js";
import { manifestSaleUnitOf } from "./manifest-sale-unit.column.js";
import { receiptOfRow, receivedColumns, updateTransfer } from "./internal-transfer-receipt.rows.js";
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
  readonly receivedAt: Date | null;
  readonly receivedBy: string | null;
  readonly receivedReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: readonly ItemRow[];
  readonly manifest: readonly {
    readonly itemId: string;
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }[];
}

interface ItemRow {
  readonly id: string;
  readonly kind: "order" | "resupply";
  readonly orderId: string | null;
  readonly resupplyId: string | null;
  readonly attachedAt: Date;
  readonly detachedAt: Date | null;
}

/** Un élément toujours porté : ni retiré, ni sorti (lot T2). */
const HELD_ITEM = { detachedAt: null } as const;

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
      where: { serviceDay, siteId, departedAt: null, receivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: TRANSFER_INCLUDE,
    });
    return rows.map(toDomain);
  }

  async holderOf(item: TransferItem): Promise<string | null> {
    const found = await this.prisma.deliveryInternalTransferItem.findFirst({
      where:
        item.kind === "order"
          ? { kind: "order", orderId: item.orderId, ...HELD_ITEM }
          : { kind: "resupply", resupplyId: item.resupplyId, ...HELD_ITEM },
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
            ...receivedColumns(snapshot.received ?? null),
            version: snapshot.version,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          },
        });
      } else {
        await updateTransfer(tx, transfer, snapshot);
      }
      // Les éléments et le manifeste ne font que s'ajouter : on n'écrit que
      // ce qui manque, et la clé primaire refuse un doublon.
      await tx.deliveryInternalTransferItem.createMany({
        data: snapshot.items.map((item) => ({
          id: item.id,
          transferId: snapshot.id,
          ...itemColumns(item),
          attachedAt: item.attachedAt,
          detachedAt: item.detachedAt ?? null,
        })),
        skipDuplicates: true,
      });
      // Un élément sorti d'un transfert prévu : la ligne reste, l'instant se pose une fois.
      const detached = snapshot.items.flatMap((item) =>
        item.detachedAt === undefined ? [] : [{ id: item.id, at: item.detachedAt }],
      );
      for (const item of detached) {
        await tx.deliveryInternalTransferItem.updateMany({
          where: { id: item.id, detachedAt: null },
          data: { detachedAt: item.at },
        });
      }
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
        receivedAt: null,
        // Tout élément porté : un transfert qui ne porte qu'un réassort (un
        // point sans commande ce jour-là, lot R3c) se place aussi.
        items: { some: HELD_ITEM },
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
      where: { kind: "order", orderId: { in: [...orderIds] }, ...HELD_ITEM },
      select: { orderId: true },
    });
    return new Set(rows.flatMap((row) => (row.orderId === null ? [] : [row.orderId])));
  }
}

function itemColumns(item: TransferItem): {
  readonly kind: "order" | "resupply";
  readonly orderId: string | null;
  readonly resupplyId: string | null;
} {
  return item.kind === "order"
    ? { kind: "order", orderId: item.orderId, resupplyId: null }
    : { kind: "resupply", orderId: null, resupplyId: item.resupplyId };
}

/** @throws {InternalTransferCorruptedError} un élément dont le genre contredit ses colonnes. */
function itemOf(transferId: string, row: ItemRow): HeldTransferItem {
  const held = {
    id: row.id,
    attachedAt: row.attachedAt,
    ...(row.detachedAt === null ? {} : { detachedAt: row.detachedAt }),
  };
  if (row.kind === "order" && row.orderId !== null) {
    return { kind: "order", orderId: row.orderId, ...held };
  }
  if (row.kind === "resupply" && row.resupplyId !== null) {
    return { kind: "resupply", resupplyId: row.resupplyId, ...held };
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
    received: receiptOfRow(row),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => itemOf(row.id, item)),
    manifest: row.manifest.map((line) => ({
      ...line,
      saleUnit: manifestSaleUnitOf(row.id, line.sku, line.saleUnit),
    })),
  });
}
