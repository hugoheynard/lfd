import type { PrismaService } from "../../platform/database/prisma.service.js";
import type { BinOwnerRow, BinRow } from "../domain/ports/delivery-loading.reader.js";
import { binHalfOf } from "./bin-half.js";
import { partnersOf } from "./bin-partners.js";
import { binSubjectOfRow } from "./bin-subject.row.js";

/**
 * **Les bacs tels que les vues du chargement les lisent** — sortis de
 * `PrismaDeliveryLoadingReader` au lot T3 du transfert interne, quand un bac
 * a reçu un second propriétaire (le transfert). Lectures seules.
 */

const BIN_SELECT = {
  id: true,
  orderId: true,
  transferId: true,
  transfer: { select: { siteLabel: true } },
  code: true,
  voidedAt: true,
  half: true,
  physicalBinId: true,
  innerBags: true,
  binType: { select: { id: true, name: true, isotherm: true, archivedAt: true } },
} as const;

/** Les bacs dans l'ordre de déclaration : c'est ce qui fait « bac 2 / 3 ». */
const DECLARATION_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

interface BinRecord {
  readonly id: string;
  readonly orderId: string | null;
  readonly transferId: string | null;
  readonly transfer: { readonly siteLabel: string } | null;
  readonly code: string;
  readonly voidedAt: Date | null;
  readonly half: string | null;
  readonly physicalBinId: string | null;
  readonly innerBags: number;
  readonly binType: {
    readonly id: string;
    readonly name: string;
    readonly isotherm: boolean;
    readonly archivedAt: Date | null;
  };
}

/** Un bac, ou `null`. */
export async function binRowById(prisma: PrismaService, binId: string): Promise<BinRow | null> {
  const row = await prisma.deliveryBin.findUnique({ where: { id: binId }, select: BIN_SELECT });
  if (row === null) {
    return null;
  }
  const [bin] = await withPartners(prisma, [row]);
  return bin ?? null;
}

/**
 * Les bacs de ces commandes et de ces transferts, annulés compris, dans
 * l'ordre de déclaration.
 */
export async function binRowsOf(
  prisma: PrismaService,
  orderIds: readonly string[],
  transferIds: readonly string[] = [],
): Promise<BinRow[]> {
  if (orderIds.length === 0 && transferIds.length === 0) {
    return [];
  }
  const rows = await prisma.deliveryBin.findMany({
    where: { OR: [{ orderId: { in: [...orderIds] } }, { transferId: { in: [...transferIds] } }] },
    orderBy: [...DECLARATION_ORDER],
    select: BIN_SELECT,
  });
  return withPartners(prisma, rows);
}

/** Chaque bac, avec l'autre moitié vivante de son bac physique quand elle est à une autre commande. */
async function withPartners(prisma: PrismaService, rows: readonly BinRecord[]): Promise<BinRow[]> {
  const physical = [...new Set(rows.flatMap((row) => row.physicalBinId ?? []))];
  const halves =
    physical.length === 0
      ? []
      : await prisma.deliveryBin.findMany({
          where: { physicalBinId: { in: physical }, voidedAt: null },
          select: { id: true, orderId: true, physicalBinId: true },
        });
  const partners = partnersOf(rows, halves);
  return rows.map((row) => ({
    id: row.id,
    owner: ownerOf(row),
    code: row.code,
    voidedAt: row.voidedAt,
    binType: {
      id: row.binType.id,
      name: row.binType.name,
      isotherm: row.binType.isotherm,
      archived: row.binType.archivedAt !== null,
    },
    half: binHalfOf(row.half),
    physicalBinId: row.physicalBinId,
    innerBags: row.innerBags,
    partner: partners.get(row.id) ?? null,
  }));
}

function ownerOf(row: BinRecord): BinOwnerRow {
  const subject = binSubjectOfRow(row);
  return subject.kind === "order"
    ? subject
    : { ...subject, siteLabel: row.transfer?.siteLabel ?? "" };
}
