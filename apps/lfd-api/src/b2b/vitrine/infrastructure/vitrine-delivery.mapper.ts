import type {
  VitrineDeliveryKind,
  VitrineDeliveryState,
  VitrineDeliveryView,
  VitrineElementKeys,
} from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { VitrineChanges, type VitrineChangesShape } from "../domain/vitrine-changes.js";
import { VitrineDelivery, type VitrineDeliveryRecord } from "../domain/vitrine-delivery.js";
import { VitrineDeliveryUnreadableError } from "./vitrine-delivery-unreadable.error.js";

/** La ligne `vitrine_deliveries`, telle que Prisma la rend. */
export interface VitrineDeliveryRowShape {
  readonly id: string;
  readonly subscriberId: string;
  readonly kind: string;
  readonly sequence: number | null;
  readonly changes: Prisma.JsonValue;
  readonly state: string;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastError: string | null;
  readonly lastStatus: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deliveredAt: Date | null;
}

const KINDS: readonly VitrineDeliveryKind[] = ["change", "test"];
const STATES: readonly VitrineDeliveryState[] = ["pending", "delivered", "failed"];

export function deliveryToDomain(row: VitrineDeliveryRowShape): VitrineDelivery {
  return VitrineDelivery.rehydrate(recordOf(row));
}

export function deliveryToView(row: VitrineDeliveryRowShape): VitrineDeliveryView {
  const record = recordOf(row);
  const { changed, removed } = record.changes.toShape();
  return {
    id: record.id,
    kind: record.kind,
    sequence: record.sequence,
    state: record.state,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt?.toISOString() ?? null,
    lastError: record.lastError,
    lastStatus: record.lastStatus,
    changed,
    removed,
    createdAt: record.createdAt.toISOString(),
    deliveredAt: record.deliveredAt?.toISOString() ?? null,
  };
}

/** Agrégat → colonnes (sans l'id ni l'abonné, que l'appelant place). */
export function deliveryToRow(record: VitrineDeliveryRecord) {
  return {
    kind: record.kind,
    sequence: record.sequence,
    changes: changesJson(record.changes.toShape()),
    state: record.state,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt,
    lastError: record.lastError,
    lastStatus: record.lastStatus,
    updatedAt: record.updatedAt,
    deliveredAt: record.deliveredAt,
  };
}

function changesJson(shape: VitrineChangesShape): Prisma.InputJsonValue {
  return {
    changed: { ...shape.changed },
    removed: { ...shape.removed },
  };
}

function recordOf(row: VitrineDeliveryRowShape): VitrineDeliveryRecord {
  const kind = KINDS.find((candidate) => candidate === row.kind);
  const state = STATES.find((candidate) => candidate === row.state);
  if (kind === undefined || state === undefined) {
    throw new VitrineDeliveryUnreadableError(row.id);
  }
  return { ...row, kind, state, changes: changesOf(row.id, row.changes) };
}

function changesOf(id: string, value: Prisma.JsonValue): VitrineChanges {
  if (!isRecord(value)) {
    throw new VitrineDeliveryUnreadableError(id);
  }
  return VitrineChanges.of({
    changed: keysOf(id, value["changed"]),
    removed: keysOf(id, value["removed"]),
  });
}

function keysOf(id: string, value: unknown): VitrineElementKeys {
  if (!isRecord(value)) {
    throw new VitrineDeliveryUnreadableError(id);
  }
  const list = (name: string): readonly string[] => {
    const entry = value[name];
    if (!Array.isArray(entry) || !entry.every((key) => typeof key === "string")) {
      throw new VitrineDeliveryUnreadableError(id);
    }
    return entry.filter((key): key is string => typeof key === "string");
  };
  return {
    items: list("items"),
    operations: list("operations"),
    shelves: list("shelves"),
    texts: list("texts"),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
