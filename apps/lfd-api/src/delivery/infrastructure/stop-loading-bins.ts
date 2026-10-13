import type { PrismaService } from "../../platform/database/prisma.service.js";
import type { StopSubject } from "../domain/entities/delivery-round-state.js";
import type { LoadingBin } from "../domain/entities/stop-loading.js";
import type { BinSubject } from "../domain/value-objects/bin-subject.js";
import { partnersOf } from "./bin-partners.js";
import { binSubjectOfRow } from "./bin-subject.row.js";

/**
 * **Les bacs que le chargement relit** — sortis de
 * `PrismaStopLoadingRepository` au lot T3 du transfert interne, quand un bac
 * a reçu un second sujet (le transfert) : l'adaptateur garde ses verrous et
 * ses écritures, ceci ne fait que lire.
 */

/**
 * La clé d'un arrêt ou d'un bac par son sujet — la même pour les deux : les
 * bacs d'un sujet sont ceux de l'arrêt du même sujet.
 */
export function subjectKey(subject: StopSubject | BinSubject): string {
  return subject.kind === "order" ? `order:${subject.orderId}` : `transfer:${subject.transferId}`;
}

export function transferIdsOf(subjects: readonly StopSubject[]): readonly string[] {
  return subjects.flatMap((s) => (s.kind === "transfer" ? [s.transferId] : []));
}

/**
 * Les bacs de ces commandes et de ces transferts, annulés compris, dans
 * l'ordre de déclaration, rangés par {@link subjectKey} — chacun avec la
 * commande de l'autre moitié vivante de son bac physique, quand elle est à
 * une autre commande (le bac PARTAGÉ, v2-4).
 */
export async function loadingBinsBySubject(
  prisma: PrismaService,
  orderIds: readonly string[],
  transferIds: readonly string[],
): Promise<ReadonlyMap<string, readonly LoadingBin[]>> {
  const rows = await prisma.deliveryBin.findMany({
    where: {
      OR: [{ orderId: { in: [...orderIds] } }, { transferId: { in: [...transferIds] } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderId: true,
      transferId: true,
      code: true,
      voidedAt: true,
      physicalBinId: true,
    },
  });
  const partners = await partnerOrdersOf(prisma, rows);
  const bySubject = new Map<string, LoadingBin[]>();
  for (const row of rows) {
    const bin = {
      id: row.id,
      code: row.code,
      voided: row.voidedAt !== null,
      partnerOrderId: partners.get(row.id) ?? null,
    };
    const key = subjectKey(binSubjectOfRow(row));
    bySubject.set(key, [...(bySubject.get(key) ?? []), bin]);
  }
  return bySubject;
}

/** Bac → commande de l'autre moitié vivante, si elle est à une autre commande. */
async function partnerOrdersOf(
  prisma: PrismaService,
  rows: readonly {
    readonly id: string;
    readonly orderId: string | null;
    readonly physicalBinId: string | null;
    readonly voidedAt: Date | null;
  }[],
): Promise<ReadonlyMap<string, string>> {
  const physical = [...new Set(rows.flatMap((row) => row.physicalBinId ?? []))];
  if (physical.length === 0) {
    return new Map();
  }
  const halves = await prisma.deliveryBin.findMany({
    where: { physicalBinId: { in: physical }, voidedAt: null },
    select: { id: true, orderId: true, physicalBinId: true },
  });
  return new Map([...partnersOf(rows, halves)].map(([binId, other]) => [binId, other.orderId]));
}

/**
 * Les bacs d'un arrêt. Un arrêt de commande : ceux de sa commande. Un arrêt
 * de transfert (lot T3, Q-T4 révisée) : ceux du TRANSFERT, puis ceux que ses
 * commandes auraient reçus avant le lot T3, quand chaque retrait avait son
 * bac — ils partent avec lui.
 */
export function binsOfSubject(
  subject: StopSubject,
  carried: ReadonlyMap<string, readonly string[]>,
  bins: ReadonlyMap<string, readonly LoadingBin[]>,
): readonly LoadingBin[] {
  const ofOrders = (carried.get(subjectKey(subject)) ?? []).flatMap(
    (orderId) => bins.get(subjectKey({ kind: "order", orderId })) ?? [],
  );
  return subject.kind === "order"
    ? ofOrders
    : [...(bins.get(subjectKey(subject)) ?? []), ...ofOrders];
}
