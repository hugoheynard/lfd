import type { SalesContextAggregate } from "../../domain/entities/sales-context.entity.js";
import { SalesContextRegistry } from "../../domain/ports/sales-context.registry.js";
import {
  SalesContextRepository,
  type SalesContextUsage,
} from "../../domain/ports/sales-context.repository.js";
import { ROOT_CONTEXT_KEY } from "../../domain/value-objects/bootstrap-contexts.js";
import type { SalesContext } from "../../domain/value-objects/sales-context.js";
import { ListActiveSalesContextsHandler } from "../list-active-sales-contexts.js";
import { ListSalesContextsHandler } from "../list-sales-contexts.js";

const ROOT: SalesContext = {
  id: "sc_root",
  key: ROOT_CONTEXT_KEY,
  label: "Vente en ligne pro",
  handleSuffix: "",
  active: true,
  shopifyProjected: false,
  position: 0,
};

const RETIRED: SalesContext = {
  id: "sc_retired",
  key: "eat_in",
  label: "Sur place",
  handleSuffix: "sur-place",
  active: false,
  shopifyProjected: true,
  position: 1,
};

class RegistryDouble extends SalesContextRegistry {
  active(): Promise<readonly SalesContext[]> {
    return Promise.resolve([ROOT]);
  }
  all(): Promise<readonly SalesContext[]> {
    return Promise.resolve([ROOT, RETIRED]);
  }
  ensureRootContext(): Promise<void> {
    return Promise.resolve();
  }
  offeredByLocations(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map([[RETIRED.key, 3]]));
  }
}

/** Seul `usageByKey` est lu : les écritures ne sont pas le sujet. */
class UsageDouble extends SalesContextRepository {
  findByKey(): Promise<SalesContextAggregate | null> {
    return Promise.resolve(null);
  }
  findProjectedByHandleSuffix(): Promise<SalesContextAggregate | null> {
    return Promise.resolve(null);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  usageByKey(): Promise<ReadonlyMap<string, SalesContextUsage>> {
    return Promise.resolve(
      new Map([[ROOT.key, { soldBy: 12, offeredBy: 0, ratedBy: 4 } satisfies SalesContextUsage]]),
    );
  }
}

describe("ListActiveSalesContextsHandler", () => {
  it("rend les contextes en service, en vue maigre", async () => {
    const views = await new ListActiveSalesContextsHandler(new RegistryDouble()).execute();

    expect(views).toEqual([{ key: ROOT_CONTEXT_KEY, label: "Vente en ligne pro", position: 0 }]);
  });
});

describe("ListSalesContextsHandler", () => {
  it("rend tout le registre, hors service compris, avec ce qui retient chaque contexte", async () => {
    const views = await new ListSalesContextsHandler(
      new RegistryDouble(),
      new UsageDouble(),
    ).execute();

    expect(views).toEqual([
      expect.objectContaining({
        key: ROOT_CONTEXT_KEY,
        root: true,
        active: true,
        offeredByLocations: 0,
        soldBy: 12,
        ratedBy: 4,
      }),
      expect.objectContaining({
        key: "eat_in",
        root: false,
        active: false,
        shopifyProjected: true,
        handleSuffix: "sur-place",
        offeredByLocations: 3,
        soldBy: 0,
        ratedBy: 0,
      }),
    ]);
  });
});
