import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import { tarte } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { ProductNotFoundError } from "../../../../catalogue/product/domain/errors/product-errors.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { RecordingCatalogEmitter } from "../../../../catalogue/shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import {
  CatalogReemission,
  type ReemissionProgress,
  type ReemissionReport,
} from "../../../../catalogue/shared/domain/ports/catalog-reemission.js";
import {
  CatalogReemissionJob,
  INTERRUPTED_BY_RESTART,
} from "../../domain/entities/catalog-reemission-job.js";
import {
  AnonymousReemissionError,
  ReemissionAlreadyRunningError,
  ReemissionJobNotFoundError,
} from "../../domain/errors/reemission-errors.js";
import { CatalogReemissionRunner } from "../catalog-reemission-runner.js";
import {
  GetCatalogReemissionHandler,
  GetCatalogReemissionQuery,
} from "../get-catalog-reemission.js";
import { GetLatestCatalogReemissionHandler } from "../get-latest-catalog-reemission.js";
import { InterruptOrphanReemissionsHandler } from "../interrupt-orphan-reemissions.js";
import {
  StartCatalogReemissionCommand,
  StartCatalogReemissionHandler,
} from "../start-catalog-reemission.js";
import { InMemoryReemissionJobs, InMemoryReemissionReader } from "./reemission-doubles.js";

/**
 * La réémission suivie (2026-10-18) : lancer rend un identifiant, le travail
 * tourne en arrière-plan et écrit son compte rendu. Les dates ne sont
 * comparées qu'à l'horloge doublée, jamais au mur.
 */
const NOW = new Date("2026-10-18T09:00:00.000Z");
const STAFF = "staff_1";

/** Une seule fiche connue, `prd_tarte`. */
class OneFiche extends CatalogFactsReader {
  products(ids: readonly string[]): Promise<ProductRecord[]> {
    return Promise.resolve(ids.includes("prd_tarte") ? [tarte()] : []);
  }
  families(): Promise<CatalogFamilyRecord[]> {
    return Promise.resolve([]);
  }
  productIdsOfFamilies(): Promise<string[]> {
    return Promise.resolve([]);
  }
  allProductIds(): Promise<string[]> {
    return Promise.resolve(["prd_tarte"]);
  }
  allFamilyIds(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/** « Tout », joué d'avance : ces fiches partent, celles-ci échouent, puis peut-être un arrêt. */
class ScriptedReemission extends CatalogReemission {
  constructor(private readonly script: { ok: string[]; failed: string[]; stop?: Error }) {
    super();
  }
  productsOfCategories(): Promise<void> {
    return Promise.resolve();
  }
  async everything(progress?: ReemissionProgress): Promise<ReemissionReport> {
    for (const id of this.script.ok) {
      await progress?.productEmitted(id);
    }
    for (const id of this.script.failed) {
      await progress?.productFailed(id, new RangeError("verrou refusé"));
    }
    if (this.script.stop !== undefined) {
      throw this.script.stop;
    }
    return { categories: 0, products: 0, failedProducts: this.script.failed };
  }
}

/** Un émetteur dont la fiche échoue toujours. */
class FailingEmitter extends RecordingCatalogEmitter {
  override emitProducts(): Promise<void> {
    return Promise.reject(new RangeError("projection impossible"));
  }
}

class OneAuthor extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(
      new StaffAuthors(
        new Map([
          [
            STAFF,
            {
              staffUserId: STAFF,
              firstName: "Hugo",
              lastName: "Heynard",
              role: "admin",
              roleLabel: "Admin",
              jobTitle: "",
            },
          ],
        ]),
      ),
    );
  }
}

function setup(options: { script?: ScriptedReemission; emitter?: RecordingCatalogEmitter } = {}) {
  const jobs = new InMemoryReemissionJobs();
  const clock = new FixedClock(NOW);
  const background = new BackgroundWork();
  const runner = new CatalogReemissionRunner(
    new OneFiche(),
    options.emitter ?? new RecordingCatalogEmitter(),
    options.script ?? new ScriptedReemission({ ok: [], failed: [] }),
    new DirectUnitOfWork(),
    jobs,
    clock,
  );
  const start = new StartCatalogReemissionHandler(
    new OneFiche(),
    jobs,
    new FixedIdGenerator("job"),
    clock,
    runner,
    background,
  );
  const launch = (productId: string | null): Promise<string> =>
    runWithRequestContext({ now: NOW, traceId: "t", actor: { type: "staff", id: STAFF } }, () =>
      start.execute(new StartCatalogReemissionCommand(productId)),
    );
  return { jobs, clock, background, start, launch };
}

describe("StartCatalogReemissionHandler", () => {
  it("rend l'identifiant tout de suite, le travail en cours, puis fini en arrière-plan", async () => {
    const { jobs, background, launch } = setup({
      script: new ScriptedReemission({ ok: ["p_1", "p_2"], failed: [] }),
    });

    const id = await launch(null);

    expect(jobs.saves[0]).toMatchObject({ id, status: "running", startedBy: STAFF, scope: "all" });
    await background.whenIdle();
    expect(jobs.stateOf(id)).toMatchObject({
      status: "done",
      productsAttempted: 2,
      productsSucceeded: 2,
      startedAt: NOW,
    });
  });

  it("refuse un second « tout » pendant qu'un premier tourne", async () => {
    const { jobs, launch } = setup();
    await jobs.save(
      CatalogReemissionJob.start({ id: "busy", productId: null, startedAt: NOW, startedBy: STAFF }),
    );

    await expect(launch(null)).rejects.toBeInstanceOf(ReemissionAlreadyRunningError);
    expect(jobs.rows.size).toBe(1);
  });

  it("laisse partir une fiche pendant qu'un « tout » tourne", async () => {
    const { jobs, launch } = setup();
    await jobs.save(
      CatalogReemissionJob.start({ id: "busy", productId: null, startedAt: NOW, startedBy: STAFF }),
    );

    await expect(launch("prd_tarte")).resolves.toBe("job_000001");
  });

  it("refuse une fiche inconnue sans créer de travail", async () => {
    const { jobs, launch } = setup();

    await expect(launch("prd_absent")).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(jobs.rows.size).toBe(0);
  });

  it("refuse un lancement sans identité", async () => {
    const { start } = setup();

    await expect(start.execute(new StartCatalogReemissionCommand(null))).rejects.toBeInstanceOf(
      AnonymousReemissionError,
    );
  });
});

describe("CatalogReemissionRunner", () => {
  it("nomme une fiche en échec dans un travail fini", async () => {
    const { jobs, background, launch } = setup({
      script: new ScriptedReemission({ ok: ["p_1"], failed: ["prd_tarte"] }),
    });

    const id = await launch(null);
    await background.whenIdle();

    expect(jobs.stateOf(id)).toMatchObject({
      status: "done",
      productsAttempted: 2,
      productsSucceeded: 1,
      failures: [{ productId: "prd_tarte", name: "Tarte au citron", reason: "verrou refusé" }],
    });
  });

  it("écrit ce qui a tout arrêté, et garde les comptes déjà faits", async () => {
    const { jobs, background, launch } = setup({
      script: new ScriptedReemission({
        ok: ["p_1"],
        failed: [],
        stop: new Error("règles refusées"),
      }),
    });

    const id = await launch(null);
    await background.whenIdle();

    expect(jobs.stateOf(id)).toMatchObject({
      status: "failed",
      productsSucceeded: 1,
      error: "règles refusées",
      finishedAt: NOW,
    });
  });

  it("écrit l'échec d'une fiche seule dans son compte rendu, sans lever", async () => {
    const { jobs, background, launch } = setup({ emitter: new FailingEmitter() });

    const id = await launch("prd_tarte");
    await background.whenIdle();

    expect(jobs.stateOf(id)).toMatchObject({
      status: "done",
      productsAttempted: 1,
      productsSucceeded: 0,
      failures: [{ productId: "prd_tarte", reason: "projection impossible" }],
    });
  });

  it("compte une fiche seule partie", async () => {
    const { jobs, background, launch } = setup();

    const id = await launch("prd_tarte");
    await background.whenIdle();

    expect(jobs.stateOf(id)).toMatchObject({ status: "done", productsSucceeded: 1 });
  });
});

describe("InterruptOrphanReemissionsHandler", () => {
  it("clôt en échec ce qui tournait encore, avec la raison du redémarrage", async () => {
    const jobs = new InMemoryReemissionJobs();
    await jobs.save(
      CatalogReemissionJob.start({
        id: "orphan",
        productId: null,
        startedAt: NOW,
        startedBy: STAFF,
      }),
    );
    const done = CatalogReemissionJob.start({
      id: "done",
      productId: "prd_tarte",
      startedAt: NOW,
      startedBy: STAFF,
    });
    done.finish(NOW);
    await jobs.save(done);

    const closed = await new InterruptOrphanReemissionsHandler(jobs, new FixedClock(NOW)).execute();

    expect(closed).toBe(1);
    expect(jobs.stateOf("orphan")).toMatchObject({
      status: "failed",
      error: INTERRUPTED_BY_RESTART,
    });
    expect(jobs.stateOf("done")?.status).toBe("done");
  });
});

describe("lectures", () => {
  it("rend la dernière, son lanceur nommé, ou rien", async () => {
    const jobs = new InMemoryReemissionJobs();
    const latest = new GetLatestCatalogReemissionHandler(
      new InMemoryReemissionReader(jobs),
      new OneAuthor(),
    );
    expect(await latest.execute()).toEqual({ job: null });

    await jobs.save(
      CatalogReemissionJob.start({ id: "j1", productId: null, startedAt: NOW, startedBy: STAFF }),
    );

    expect((await latest.execute()).job).toMatchObject({
      id: "j1",
      status: "running",
      startedAt: NOW.toISOString(),
      finishedAt: null,
      startedByName: "Hugo Heynard",
    });
  });

  it("rend un travail par son identifiant, et refuse un inconnu", async () => {
    const jobs = new InMemoryReemissionJobs();
    await jobs.save(
      CatalogReemissionJob.start({
        id: "j1",
        productId: "prd_tarte",
        startedAt: NOW,
        startedBy: STAFF,
      }),
    );
    const byId = new GetCatalogReemissionHandler(
      new InMemoryReemissionReader(jobs),
      new OneAuthor(),
    );

    expect(await byId.execute(new GetCatalogReemissionQuery("j1"))).toMatchObject({
      scope: "product",
      productId: "prd_tarte",
    });
    await expect(byId.execute(new GetCatalogReemissionQuery("nope"))).rejects.toBeInstanceOf(
      ReemissionJobNotFoundError,
    );
  });
});
