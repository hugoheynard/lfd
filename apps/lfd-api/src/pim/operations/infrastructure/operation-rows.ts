import { Prisma } from "../../../platform/database/client/client.js";
import {
  localizedColumn,
  optionalLocalizedColumn,
  readLocalizedColumn,
} from "../../catalogue/shared/infrastructure/json-readers.js";
import type { OperationRecord, OperationSnapshot } from "../domain/entities/operation.js";

/** Une ligne d'opération telle que Prisma la rend, sa sélection triée par rang. */
export interface OperationRow {
  readonly key: string;
  readonly name: unknown;
  readonly lede: unknown;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly announceFrom: Date;
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  readonly pickupFrom: Date;
  readonly pickupUntil: Date;
  readonly audience: string;
  readonly archivedAt: Date | null;
  readonly items: readonly { readonly sku: string }[];
}

/** La lecture de la sélection, dans l'ordre du rayon. */
export const ITEMS_IN_ORDER = {
  items: { select: { sku: true }, orderBy: { position: "asc" } },
} as const;

/**
 * La ligne vers l'état de l'agrégat. Les jours `DATE` reviennent de Prisma en
 * minuit UTC : on n'en garde que la partie `AAAA-MM-JJ`, qui est le jour
 * stocké — aucun fuseau n'y entre.
 */
export function toRecord(row: OperationRow): OperationRecord {
  return {
    key: row.key,
    name: readLocalizedColumn(row.name, "operations.name"),
    lede: optionalLocalizedColumn(row.lede),
    image: row.imageUrl === null ? null : { url: row.imageUrl, alt: row.imageAlt ?? "" },
    schedule: {
      announceFrom: row.announceFrom,
      orderFrom: row.orderFrom,
      orderUntil: row.orderUntil,
      pickupFrom: dayOf(row.pickupFrom),
      pickupUntil: dayOf(row.pickupUntil),
    },
    audience: row.audience,
    skus: row.items.map((item) => item.sku),
    archivedAt: row.archivedAt,
  };
}

/** L'état de l'agrégat vers les colonnes de `operations` — la sélection à part. */
export function operationColumns(snapshot: OperationSnapshot) {
  const { schedule } = snapshot;
  return {
    name: localizedColumn(snapshot.name),
    // `DbNull` et non `null` : une colonne `Json?` distingue le NULL SQL du
    // `null` JSON, et une accroche retirée doit EFFACER la colonne.
    lede: snapshot.lede === null ? Prisma.DbNull : localizedColumn(snapshot.lede),
    imageUrl: snapshot.image?.url ?? null,
    imageAlt: snapshot.image?.alt ?? null,
    announceFrom: schedule.announceFrom,
    orderFrom: schedule.orderFrom,
    orderUntil: schedule.orderUntil,
    // Un jour `AAAA-MM-JJ` seul se lit en minuit UTC, et Prisma n'écrit que
    // la date d'un `DATE` : le jour stocké est celui qu'on a donné.
    pickupFrom: new Date(schedule.pickupFrom.value),
    pickupUntil: new Date(schedule.pickupUntil.value),
    audience: snapshot.audience,
    archivedAt: snapshot.archivedAt,
  };
}

/** Les lignes de la sélection, leur rang à partir de 0. */
export function itemRows(snapshot: OperationSnapshot) {
  return snapshot.skus.map((sku, position) => ({ operationKey: snapshot.key, sku, position }));
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
