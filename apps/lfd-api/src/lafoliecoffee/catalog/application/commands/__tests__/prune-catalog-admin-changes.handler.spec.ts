import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CATALOG_ADMIN_CHANGE_RETENTION_MS,
  CatalogAdminChangePruner,
} from "../../../domain/ports/catalog-admin-change.pruner.js";
import { PruneCatalogAdminChangesHandler } from "../prune-catalog-admin-changes.handler.js";

class RecordingPruner extends CatalogAdminChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(3);
  }
}

describe("PruneCatalogAdminChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneCatalogAdminChangesHandler(pruner, clock).execute()).resolves.toBe(3);

    expect(pruner.cutoffs).toEqual([
      new Date(clock.now().getTime() - CATALOG_ADMIN_CHANGE_RETENTION_MS),
    ]);
  });
});
