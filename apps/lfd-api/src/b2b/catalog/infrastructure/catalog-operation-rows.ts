import { Prisma } from "../../../platform/database/client/client.js";
import type {
  CatalogOperationFacts,
  CatalogOperationState,
  OperationText,
} from "../domain/entities/catalog-operation.js";
import type { CatalogOperationOverrideState } from "../domain/entities/catalog-operation-override.js";
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

/** Une ligne de surcharge telle que Prisma la rend. */
export interface OverrideRow {
  readonly operationKey: string;
  readonly isHidden: boolean;
  readonly orderUntil: Date | null;
  readonly audience: string | null;
  readonly hiddenSkus: readonly string[];
  readonly decidedBy: string | null;
  readonly decidedAt: Date;
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
      image: row.imageUrl === null ? null : { url: row.imageUrl, alt: row.imageAlt ?? "" },
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

/** Les colonnes de `catalog_operations` — la sélection à part. */
export function operationColumns(state: CatalogOperationState) {
  const { facts } = state;
  return {
    name: { ...facts.name },
    // `DbNull` : une colonne `Json?` distingue le NULL SQL du `null` JSON.
    lede: facts.lede === null ? Prisma.DbNull : { ...facts.lede },
    imageUrl: facts.image?.url ?? null,
    imageAlt: facts.image?.alt ?? null,
    announceFrom: facts.announceFrom,
    orderFrom: facts.orderFrom,
    orderUntil: facts.orderUntil,
    // Un jour `AAAA-MM-JJ` seul se lit en minuit UTC, et Prisma n'écrit que la
    // date d'un `DATE` : le jour stocké est celui qu'on a reçu.
    pickupFrom: new Date(facts.pickupFrom),
    pickupUntil: new Date(facts.pickupUntil),
    audience: facts.audience,
    receivedAt: facts.receivedAt,
    withdrawnAt: state.withdrawnAt,
  };
}

export function toOverrideState(row: OverrideRow): CatalogOperationOverrideState {
  return {
    operationKey: row.operationKey,
    restriction: {
      isHidden: row.isHidden,
      orderUntil: row.orderUntil,
      audience: row.audience === null ? null : catalogOperationAudience(row.audience),
      hiddenSkus: [...row.hiddenSkus],
    },
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
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

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Les faits, prêts pour la table des items. */
export function itemRows(facts: CatalogOperationFacts) {
  return facts.skus.map((sku, position) => ({ operationKey: facts.key, sku, position }));
}
