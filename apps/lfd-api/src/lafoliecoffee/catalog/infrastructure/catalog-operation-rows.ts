import type {
  CatalogOperationState,
  OperationFocal,
  OperationText,
} from "../domain/entities/catalog-operation.js";
import { UnreadableOperationColumnError } from "../domain/errors/catalog-operation-errors.js";
import { catalogOperationAudience } from "../domain/operation-audience.js";
import { operationText } from "./archived-operations.js";

/** Une ligne d'opération telle que Prisma la rend, sa sélection triée par rang. */
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
  readonly receivedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly items: readonly { readonly sku: string }[];
}

/** La sélection, dans l'ordre du rayon. */
export const ITEMS_IN_ORDER = {
  items: { select: { sku: true }, orderBy: { position: "asc" } },
} as const;

/**
 * La ligne vers l'état de l'agrégat. Les jours `DATE` reviennent en minuit
 * UTC : on n'en garde que `AAAA-MM-JJ`, qui est le jour stocké — aucun fuseau
 * n'y entre.
 */
export function toOperationState(row: OperationRow): CatalogOperationState {
  return {
    facts: {
      key: row.key,
      name: readText(row.name, "catalog_operations.name"),
      lede: row.lede === null ? null : readText(row.lede, "catalog_operations.lede"),
      image:
        row.imageUrl === null
          ? null
          : {
              url: row.imageUrl,
              alt: row.imageAlt ?? "",
              focal: focalOf(row.imageFocalX, row.imageFocalY),
            },
      announceFrom: row.announceFrom,
      orderFrom: row.orderFrom,
      orderUntil: row.orderUntil,
      pickupFrom: dayOf(row.pickupFrom),
      pickupUntil: dayOf(row.pickupUntil),
      audience: catalogOperationAudience(row.audience),
      skus: row.items.map((item) => item.sku),
      receivedAt: row.receivedAt,
    },
    withdrawnAt: row.withdrawnAt,
  };
}

/** Le texte relu depuis le `jsonb` — une forme inattendue échoue bruyamment. */
function readText(raw: unknown, column: string): OperationText {
  if (!isRecord(raw)) {
    throw new UnreadableOperationColumnError(column);
  }
  const record = raw;
  const fr = record["fr"];
  if (typeof fr !== "string") {
    throw new UnreadableOperationColumnError(column);
  }
  const en = record["en"];
  const it = record["it"];
  return operationText({
    fr,
    en: typeof en === "string" ? en : undefined,
    it: typeof it === "string" ? it : undefined,
  });
}

function isRecord(raw: unknown): raw is Readonly<Record<string, unknown>> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** Les deux colonnes, ou aucune (CHECK de la migration
 * `20261011140000_le_point_focal_jusqu_a_la_vitrine`). */
function focalOf(x: number | null, y: number | null): OperationFocal | null {
  return x === null || y === null ? null : { x, y };
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
