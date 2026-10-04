import type { PrismaService } from "../../platform/database/prisma.service.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type {
  ContainerBin,
  ContainerNature,
  PackingContainerState,
} from "../domain/entities/order-contents.js";
import type { ContainerMode, PackingSheetSnapshot } from "../domain/entities/packing-sheet.js";

/** Une valeur de base hors de ce que les CHECK admettent — un défaut, jamais un refus. */
class PackingContainerRowError extends TechnicalError {
  constructor(column: string, value: string) {
    super(
      "packing.container.row_invalid",
      `La colonne ${column} porte « ${value} », que le colisage ne connaît pas : rien n'a été écrit. Signalez-le à l'équipe technique.`,
    );
  }
}

/** Ce qu'on relit d'un contenant — le même `select` pour le bac et pour le poste. */
export const CONTAINER_SELECT = {
  select: {
    id: true,
    nature: true,
    binId: true,
    binCode: true,
    binHalf: true,
    openedAt: true,
    openedBy: true,
    voidedAt: true,
    voidedBy: true,
    lines: { select: { sku: true, quantity: true }, orderBy: { sku: "asc" as const } },
  },
  orderBy: [{ openedAt: "asc" as const }, { id: "asc" as const }],
};

/** Une ligne de `packing.container`, telle que `CONTAINER_SELECT` la relit. */
interface ContainerRow {
  readonly id: string;
  readonly nature: string;
  readonly binId: string | null;
  readonly binCode: string | null;
  readonly binHalf: string | null;
  readonly openedAt: Date;
  readonly openedBy: string;
  readonly voidedAt: Date | null;
  readonly voidedBy: string | null;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

export function containerModeOf(value: string): ContainerMode {
  if (value === "counted" || value === "listed") {
    return value;
  }
  throw new PackingContainerRowError("packing_order.container_mode", value);
}

function natureOf(value: string): ContainerNature {
  if (value === "bin" || value === "bag") {
    return value;
  }
  throw new PackingContainerRowError("container.nature", value);
}

function halfOf(value: string | null): ContainerBin["half"] {
  if (value === null || value === "left" || value === "right") {
    return value;
  }
  throw new PackingContainerRowError("container.bin_half", value);
}

export function containerOf(row: ContainerRow): PackingContainerState {
  return {
    id: row.id,
    nature: natureOf(row.nature),
    // Le CHECK de la table tient `bin_id` et `bin_code` ensemble.
    bin:
      row.binId === null || row.binCode === null
        ? null
        : { binId: row.binId, code: row.binCode, half: halfOf(row.binHalf) },
    opened: { at: row.openedAt, by: row.openedBy },
    voided:
      row.voidedAt === null || row.voidedBy === null
        ? null
        : { at: row.voidedAt, by: row.voidedBy },
    lines: row.lines,
  };
}

/**
 * Écrit les contenants du bac depuis l'agrégat : les neufs s'insèrent, les
 * annulés gagnent leur `voided_at`, chaque ligne prend sa quantité. Jamais de
 * suppression — une quantité retirée à zéro reste une ligne à zéro.
 */
export async function saveContainers(
  prisma: PrismaService,
  snapshot: PackingSheetSnapshot,
): Promise<void> {
  for (const container of snapshot.containerList) {
    await prisma.packingContainer.upsert({
      where: { id: container.id },
      create: {
        id: container.id,
        serviceDay: snapshot.serviceDay,
        orderId: snapshot.orderId,
        nature: container.nature,
        binId: container.bin?.binId ?? null,
        binCode: container.bin?.code ?? null,
        binHalf: container.bin?.half ?? null,
        openedAt: container.opened.at,
        openedBy: container.opened.by,
        voidedAt: container.voided?.at ?? null,
        voidedBy: container.voided?.by ?? null,
      },
      update: { voidedAt: container.voided?.at ?? null, voidedBy: container.voided?.by ?? null },
    });
    for (const line of container.lines) {
      await prisma.packingContainerLine.upsert({
        where: { containerId_sku: { containerId: container.id, sku: line.sku } },
        create: {
          containerId: container.id,
          serviceDay: snapshot.serviceDay,
          sku: line.sku,
          quantity: line.quantity,
        },
        update: { quantity: line.quantity },
      });
    }
  }
}
