import { CorruptedRecordError, isJsonRecord } from "../../../../platform/database/json-columns.js";
import type {
  CatalogReemissionJobSnapshot,
  ReemissionFailure,
  ReemissionScope,
  ReemissionStatus,
} from "../domain/entities/catalog-reemission-job.js";

/** La ligne telle que Prisma la rend — décrite ici pour qu'aucun type `Prisma.*` ne sorte. */
export interface ReemissionJobRow {
  readonly id: string;
  readonly scope: string;
  readonly productId: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: string;
  readonly productsAttempted: number;
  readonly productsSucceeded: number;
  readonly failures: unknown;
  readonly error: string | null;
  readonly startedBy: string;
}

const SCOPES: readonly ReemissionScope[] = ["all", "product"];
const STATUSES: readonly ReemissionStatus[] = ["running", "done", "failed"];

/** Ligne → état du travail ; une valeur hors domaine est une corruption, dite comme telle. */
export function snapshotOf(row: ReemissionJobRow): CatalogReemissionJobSnapshot {
  const scope = SCOPES.find((candidate) => candidate === row.scope);
  const status = STATUSES.find((candidate) => candidate === row.status);
  if (scope === undefined) {
    throw new CorruptedRecordError("catalog_reemission_job.scope");
  }
  if (status === undefined) {
    throw new CorruptedRecordError("catalog_reemission_job.status");
  }
  return { ...row, scope, status, failures: failuresOf(row.failures) };
}

function failuresOf(value: unknown): ReemissionFailure[] {
  if (!Array.isArray(value)) {
    throw new CorruptedRecordError("catalog_reemission_job.failures");
  }
  return value.map((entry: unknown) => {
    if (
      !isJsonRecord(entry) ||
      typeof entry["productId"] !== "string" ||
      typeof entry["reason"] !== "string" ||
      (entry["name"] !== null && typeof entry["name"] !== "string")
    ) {
      throw new CorruptedRecordError("catalog_reemission_job.failures");
    }
    return { productId: entry["productId"], name: entry["name"], reason: entry["reason"] };
  });
}

/** État du travail → colonnes. */
export function rowOf(job: CatalogReemissionJobSnapshot) {
  return {
    id: job.id,
    scope: job.scope,
    productId: job.productId,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    status: job.status,
    productsAttempted: job.productsAttempted,
    productsSucceeded: job.productsSucceeded,
    failures: job.failures.map((failure) => ({
      productId: failure.productId,
      name: failure.name,
      reason: failure.reason,
    })),
    error: job.error,
    startedBy: job.startedBy,
  };
}
