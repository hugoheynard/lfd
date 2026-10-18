import type { CatalogReemissionView } from "@lfd/pim-contracts";

import type { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { CatalogReemissionJobSnapshot } from "../domain/entities/catalog-reemission-job.js";

/** L'état rangé d'un travail → la vue que l'écran suit, son lanceur nommé. */
export function reemissionViewOf(
  job: CatalogReemissionJobSnapshot,
  authors: StaffAuthors,
): CatalogReemissionView {
  return {
    id: job.id,
    scope: job.scope,
    productId: job.productId,
    status: job.status,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    productsAttempted: job.productsAttempted,
    productsSucceeded: job.productsSucceeded,
    failures: job.failures.map((failure) => ({ ...failure })),
    error: job.error,
    startedBy: job.startedBy,
    startedByName: authors.nameOf(job.startedBy),
  };
}
