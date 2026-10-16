import { Prisma } from "../../../platform/database/client/client.js";
import { CorruptedRecordError, isJsonRecord } from "../../../platform/database/json-columns.js";
import type { OperationRecord, OperationSnapshot } from "../domain/entities/operation.js";
import type { OperationTextInput } from "../domain/value-objects/operation-text.js";

/** Une ligne de `catalog_operations` telle que Prisma la rend, sa sélection triée par rang. */
export interface OperationRow {
  readonly key: string;
  readonly name: unknown;
  readonly lede: unknown;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly imageFocalX: number | null;
  readonly imageFocalY: number | null;
  readonly announceFrom: Date;
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  readonly pickupFrom: Date;
  readonly pickupUntil: Date;
  readonly audience: string;
  readonly hidden: boolean;
  readonly withdrawnAt: Date | null;
  readonly writtenBy: string | null;
  readonly writtenAt: Date | null;
  readonly items: readonly { readonly sku: string }[];
}

/** La sélection, dans l'ordre du rayon. */
export const ITEMS_IN_ORDER = {
  items: { select: { sku: true }, orderBy: { position: "asc" } },
} as const;

/**
 * La ligne vers l'agrégat. `withdrawn_at` y est l'archivage : retirée par un
 * envoi du référentiel ou archivée au commerce, une opération ne se modifie
 * plus (plan, « Corrections après vitruve »). Les jours `DATE` reviennent en
 * minuit UTC : on n'en garde que `AAAA-MM-JJ`, aucun fuseau n'y entre.
 */
export function toRecord(row: OperationRow): OperationRecord {
  return {
    key: row.key,
    name: readText(row.name, "catalog_operations.name"),
    lede: row.lede === null ? null : readText(row.lede, "catalog_operations.lede"),
    image: row.imageUrl === null ? null : { url: row.imageUrl, focal: focalOf(row) },
    schedule: {
      announceFrom: row.announceFrom,
      orderFrom: row.orderFrom,
      orderUntil: row.orderUntil,
      pickupFrom: dayOf(row.pickupFrom),
      pickupUntil: dayOf(row.pickupUntil),
    },
    audience: row.audience,
    skus: row.items.map((item) => item.sku),
    hidden: row.hidden,
    archivedAt: row.withdrawnAt,
    lastWrite: row.writtenAt === null ? null : { by: row.writtenBy, at: row.writtenAt },
  };
}

/**
 * Les colonnes que l'agrégat écrit — la sélection à part.
 *
 * Ni `received_at` ni `image_gesture_id` : `received_at` ne bouge qu'à la
 * naissance et à la migration (`PrismaOperationAdoption`), et le geste
 * d'image n'est plus écrit par personne une fois la bascule faite.
 * Le point focal, si (lot 2) : l'agrégat le lit à la médiathèque au choix de
 * l'image et le suit quand elle le redécrit.
 */
export function operationColumns(snapshot: OperationSnapshot) {
  return {
    name: { ...snapshot.name },
    // `DbNull` : une colonne `Json?` distingue le NULL SQL du `null` JSON.
    lede: snapshot.lede === null ? Prisma.DbNull : { ...snapshot.lede },
    imageUrl: snapshot.image?.url ?? null,
    // Le texte alternatif vient de la médiathèque, relu à chaque lecture
    // (plan, « Après le lot 2 ») : l'opération n'en garde plus. La colonne
    // reste (§0) ; celle d'une copie reçue garde ce que le référentiel disait.
    imageAlt: null,
    imageFocalX: snapshot.image?.focal?.x ?? null,
    imageFocalY: snapshot.image?.focal?.y ?? null,
    announceFrom: snapshot.schedule.announceFrom,
    orderFrom: snapshot.schedule.orderFrom,
    orderUntil: snapshot.schedule.orderUntil,
    // Un jour `AAAA-MM-JJ` seul se lit en minuit UTC, et Prisma n'écrit que la
    // date d'un `DATE` : le jour stocké est celui qu'on a donné.
    pickupFrom: new Date(snapshot.schedule.pickupFrom.value),
    pickupUntil: new Date(snapshot.schedule.pickupUntil.value),
    audience: snapshot.audience,
    hidden: snapshot.hidden,
    withdrawnAt: snapshot.archivedAt,
    writtenBy: snapshot.lastWrite?.by ?? null,
    writtenAt: snapshot.lastWrite?.at ?? null,
  };
}

/** La sélection, prête pour `catalog_operation_items`. */
export function itemRows(snapshot: OperationSnapshot) {
  return snapshot.skus.map((sku, position) => ({ operationKey: snapshot.key, sku, position }));
}

/** Le texte relu depuis le `jsonb` — une forme inattendue échoue bruyamment. */
function readText(raw: unknown, column: string): OperationTextInput {
  if (!isJsonRecord(raw) || typeof raw["fr"] !== "string") {
    throw new CorruptedRecordError(column);
  }
  const en = raw["en"];
  const it = raw["it"];
  return {
    fr: raw["fr"],
    en: typeof en === "string" ? en : undefined,
    it: typeof it === "string" ? it : undefined,
  };
}

/** Les deux coordonnées ou aucune : une seule ne dit pas où regarder. */
function focalOf(row: OperationRow): { readonly x: number; readonly y: number } | null {
  return row.imageFocalX === null || row.imageFocalY === null
    ? null
    : { x: row.imageFocalX, y: row.imageFocalY };
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
