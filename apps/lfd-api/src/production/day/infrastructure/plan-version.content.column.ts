import { z } from "zod";

import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import type { Prisma } from "../../../platform/database/client/client.js";
import type {
  PlanVersionAuthor,
  PlanVersionContent,
  VersionedLine,
  VersionedResupply,
} from "../domain/entities/plan-version.content.js";

/**
 * La colonne `plan_versions.content` (forme 1), dans les deux sens : écrite
 * champ par champ (aucun objet du domaine ne passe tel quel à Prisma), relue
 * par un schéma qui VÉRIFIE la forme — `jsonb` rend du JSON non typé, et un
 * cast mentirait au compilateur.
 */

const FIELD = "production.plan_versions.content";

const author = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staff"), staffId: z.string(), name: z.string().nullable() }),
  z.object({ kind: z.literal("customer") }),
  z.object({ kind: z.literal("guest") }),
  z.object({ kind: z.literal("system") }),
]);

const line = z.object({
  sku: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  saleUnit: z.enum(["piece", "weight"]),
  options: z.array(
    z.object({ groupName: z.string(), choiceLabel: z.string(), quantity: z.number().int() }),
  ),
});

const resupply = z.object({
  resupplyId: z.string(),
  siteId: z.string(),
  siteLabel: z.string().nullable(),
  name: z.string().nullable(),
  lines: z.array(line),
});

const content = z.object({
  shipments: z.array(
    z.object({
      orderId: z.string(),
      rank: z.number().int(),
      reference: z.string(),
      customerLabel: z.string(),
      fulfillmentMethod: z.enum(["pickup", "delivery"]),
      dueAt: z.string().nullable(),
      offPlan: z.boolean().nullable(),
      entry: z.enum(["arrested", "retaken", "arrested_after_reopen", "unchanged", "unknown"]),
      lines: z.array(line),
    }),
  ),
  counts: z.array(
    z.object({
      sku: z.string(),
      productName: z.string(),
      quantity: z.number().int(),
      saleUnit: z.enum(["piece", "weight"]),
    }),
  ),
  resupplies: z.array(resupply),
  launchedResupplies: z.array(resupply.extend({ launchedAt: z.string(), launchedBy: z.string() })),
  withdrawn: z.array(
    z.object({
      orderId: z.string(),
      rank: z.number().int(),
      at: z.string(),
      by: author.nullable(),
    }),
  ),
});

/** Relit le contenu ; une forme inattendue est une erreur technique nommée. */
export function contentOfColumn(value: unknown): PlanVersionContent {
  const parsed = content.safeParse(value);
  if (!parsed.success) {
    throw new CorruptedRecordError(FIELD);
  }
  return parsed.data;
}

/** L'auteur, tel que les colonnes `recorded_by_*` le rangent. */
export function authorOfColumns(
  kind: string,
  id: string | null,
  name: string | null,
): PlanVersionAuthor {
  switch (kind) {
    case "staff":
      if (id === null) {
        throw new CorruptedRecordError("production.plan_versions.recorded_by_id");
      }
      return { kind: "staff", staffId: id, name };
    case "customer":
    case "guest":
    case "system":
      return { kind };
    default:
      throw new CorruptedRecordError("production.plan_versions.recorded_by_kind");
  }
}

/** Le contenu à écrire, champ par champ. */
export function columnOfContent(value: PlanVersionContent): Prisma.InputJsonObject {
  return {
    shipments: value.shipments.map((shipment) => ({
      orderId: shipment.orderId,
      rank: shipment.rank,
      reference: shipment.reference,
      customerLabel: shipment.customerLabel,
      fulfillmentMethod: shipment.fulfillmentMethod,
      dueAt: shipment.dueAt,
      offPlan: shipment.offPlan,
      entry: shipment.entry,
      lines: shipment.lines.map(columnOfLine),
    })),
    counts: value.counts.map((count) => ({
      sku: count.sku,
      productName: count.productName,
      quantity: count.quantity,
      saleUnit: count.saleUnit,
    })),
    resupplies: value.resupplies.map(columnOfResupply),
    launchedResupplies: value.launchedResupplies.map((launched) => ({
      ...columnOfResupply(launched),
      launchedAt: launched.launchedAt,
      launchedBy: launched.launchedBy,
    })),
    withdrawn: value.withdrawn.map((withdrawal) => ({
      orderId: withdrawal.orderId,
      rank: withdrawal.rank,
      at: withdrawal.at,
      by: withdrawal.by === null ? null : columnOfAuthor(withdrawal.by),
    })),
  };
}

function columnOfLine(value: VersionedLine): Prisma.InputJsonObject {
  return {
    sku: value.sku,
    productName: value.productName,
    quantity: value.quantity,
    saleUnit: value.saleUnit,
    options: value.options.map((option) => ({
      groupName: option.groupName,
      choiceLabel: option.choiceLabel,
      quantity: option.quantity,
    })),
  };
}

function columnOfResupply(value: VersionedResupply): Prisma.InputJsonObject {
  return {
    resupplyId: value.resupplyId,
    siteId: value.siteId,
    siteLabel: value.siteLabel,
    name: value.name,
    lines: value.lines.map(columnOfLine),
  };
}

function columnOfAuthor(value: PlanVersionAuthor): Prisma.InputJsonObject {
  return value.kind === "staff"
    ? { kind: value.kind, staffId: value.staffId, name: value.name }
    : { kind: value.kind };
}
