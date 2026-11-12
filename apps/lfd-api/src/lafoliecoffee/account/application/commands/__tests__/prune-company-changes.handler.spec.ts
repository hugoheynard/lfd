import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  COMPANY_CHANGE_RETENTION_MS,
  CompanyChangePruner,
} from "../../../domain/ports/company-change.pruner.js";
import { PruneCompanyChangesHandler } from "../prune-company-changes.handler.js";

class RecordingPruner extends CompanyChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(2);
  }
}

describe("PruneCompanyChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneCompanyChangesHandler(pruner, clock).execute()).resolves.toBe(2);

    expect(pruner.cutoffs).toEqual([new Date(clock.now().getTime() - COMPANY_CHANGE_RETENTION_MS)]);
  });
});
