import { INTERRUPTED_BY_RESTART, CatalogReemissionJob } from "../catalog-reemission-job.js";
import {
  InvalidReemissionScopeError,
  ReemissionJobClosedError,
} from "../../errors/reemission-errors.js";

/**
 * Le travail de réémission : un compte rendu qui avance, puis se ferme. Les
 * dates ne sont comparées qu'entre elles — aucune horloge n'est lue ici.
 */
const STARTED = new Date("2026-10-18T09:00:00.000Z");
const FINISHED = new Date("2026-10-18T09:01:13.000Z");

function everything(): CatalogReemissionJob {
  return CatalogReemissionJob.start({
    id: "job_1",
    productId: null,
    startedAt: STARTED,
    startedBy: "staff_1",
  });
}

describe("CatalogReemissionJob", () => {
  it("naît en cours, sans rien compté, avec sa portée déduite", () => {
    expect(everything().snapshot()).toEqual({
      id: "job_1",
      scope: "all",
      productId: null,
      startedAt: STARTED,
      finishedAt: null,
      status: "running",
      productsAttempted: 0,
      productsSucceeded: 0,
      failures: [],
      error: null,
      startedBy: "staff_1",
    });
    const one = CatalogReemissionJob.start({
      id: "job_2",
      productId: "prd_1",
      startedAt: STARTED,
      startedBy: "staff_1",
    });
    expect(one.scope).toBe("product");
  });

  it("refuse une fiche vide et un lanceur vide", () => {
    const start = { id: "j", startedAt: STARTED };
    expect(() => CatalogReemissionJob.start({ ...start, productId: " ", startedBy: "s" })).toThrow(
      InvalidReemissionScopeError,
    );
    expect(() => CatalogReemissionJob.start({ ...start, productId: null, startedBy: "" })).toThrow(
      InvalidReemissionScopeError,
    );
  });

  it("compte les fiches parties et nomme celles en échec", () => {
    const job = everything();

    job.productSucceeded();
    job.productFailed({ productId: "prd_2", name: "Cannelé", reason: "verrou refusé" });
    job.finish(FINISHED);

    expect(job.snapshot()).toMatchObject({
      status: "done",
      finishedAt: FINISHED,
      productsAttempted: 2,
      productsSucceeded: 1,
      failures: [{ productId: "prd_2", name: "Cannelé", reason: "verrou refusé" }],
      error: null,
    });
  });

  it("garde ses comptes quand il échoue en route, et écrit pourquoi", () => {
    const job = everything();
    job.productSucceeded();

    job.fail("règles refusées", FINISHED);

    expect(job.snapshot()).toMatchObject({
      status: "failed",
      productsSucceeded: 1,
      error: "règles refusées",
    });
  });

  it("écrit la raison d'un redémarrage quand il est interrompu", () => {
    const job = everything();

    job.interrupt(FINISHED);

    expect(job.snapshot()).toMatchObject({ status: "failed", error: INTERRUPTED_BY_RESTART });
    expect(INTERRUPTED_BY_RESTART).toMatch(/redémarrage/u);
  });

  it("ne change plus une fois clos", () => {
    const job = everything();
    job.finish(FINISHED);

    expect(() => job.productSucceeded()).toThrow(ReemissionJobClosedError);
    expect(() => job.fail("x", FINISHED)).toThrow(ReemissionJobClosedError);
    expect(() => job.interrupt(FINISHED)).toThrow(ReemissionJobClosedError);
  });

  it("refuse de relire une portée incohérente", () => {
    const snapshot = { ...everything().snapshot(), productId: "prd_1" };
    expect(() => CatalogReemissionJob.restore(snapshot)).toThrow(InvalidReemissionScopeError);
  });

  it("ne laisse pas muter son instantané", () => {
    const job = everything();
    const before = job.snapshot();
    job.productFailed({ productId: "p", name: null, reason: "r" });
    expect(before.failures).toEqual([]);
  });
});
