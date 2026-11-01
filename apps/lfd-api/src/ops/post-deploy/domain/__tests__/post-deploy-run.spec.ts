import {
  IllegalPostDeployTransitionError,
  SimulationExpiredError,
  SimulationOfAnotherAuthorError,
  SimulationOfAnotherRevisionError,
  SimulationRequiredError,
} from "../post-deploy-errors.js";
import { PostDeployRun, SIMULATION_FRESHNESS_MINUTES, type RunReport } from "../post-deploy-run.js";

const MINUTE = 60_000;
const SIMULATED_AT = new Date();
const REPORT: RunReport = { writable: 3, byHand: 1, summary: ["3 à écrire"], sample: [] };
const DONE: RunReport = { writable: 3, byHand: 1, summary: ["3 écrites"], sample: [] };

function simulated(): PostDeployRun {
  return PostDeployRun.simulated({
    id: "postdeploy_1",
    operationKey: "mercuriale-promotion-policies",
    revision: "rev-a",
    actor: "fiche-hugo",
    at: SIMULATED_AT,
    report: REPORT,
  });
}

const after = (minutes: number): Date => new Date(SIMULATED_AT.getTime() + minutes * MINUTE);

function running(): PostDeployRun {
  const run = simulated();
  run.start({ actor: "fiche-hugo", revision: "rev-a", at: after(1) });
  return run;
}

describe("PostDeployRun", () => {
  it("naît « simulated », neuf en base, avec son rapport et son auteur", () => {
    const run = simulated();

    expect(run.currentState).toBe("simulated");
    expect(run.persistedState).toBeNull();
    expect(run.snapshot()).toMatchObject({ simulatedBy: "fiche-hugo", simulationReport: REPORT });
  });

  it("s'applique par la même personne, sur la même image, dans le délai", () => {
    const run = simulated();

    run.start({ actor: "fiche-hugo", revision: "rev-a", at: after(SIMULATION_FRESHNESS_MINUTES) });

    expect(run.snapshot()).toMatchObject({
      state: "running",
      startedAt: after(SIMULATION_FRESHNESS_MINUTES),
    });
  });

  it("refuse une autre personne : on n'applique que ce qu'on a lu", () => {
    expect(() =>
      simulated().start({ actor: "fiche-autre", revision: "rev-a", at: after(1) }),
    ).toThrow(SimulationOfAnotherAuthorError);
  });

  it("refuse une autre image", () => {
    expect(() =>
      simulated().start({ actor: "fiche-hugo", revision: "rev-b", at: after(1) }),
    ).toThrow(SimulationOfAnotherRevisionError);
  });

  it("refuse une simulation de plus de quinze minutes", () => {
    expect(() =>
      simulated().start({
        actor: "fiche-hugo",
        revision: "rev-a",
        at: after(SIMULATION_FRESHNESS_MINUTES + 1),
      }),
    ).toThrow(SimulationExpiredError);
  });

  it("refuse d'appliquer deux fois la même simulation", () => {
    const run = running();

    expect(() => run.start({ actor: "fiche-hugo", revision: "rev-a", at: after(2) })).toThrow(
      SimulationRequiredError,
    );
  });

  it("le message de refus dit « simulez d'abord »", () => {
    expect(() =>
      simulated().start({ actor: "fiche-autre", revision: "rev-a", at: after(1) }),
    ).toThrow(/Simulez d'abord/u);
  });

  it("avance, puis réussit avec le rapport final", () => {
    const run = running();

    run.recordProgress({ ...DONE, writable: 1 });
    run.succeed(DONE, after(3));

    expect(run.snapshot()).toMatchObject({
      state: "succeeded",
      progressReport: DONE,
      finishedAt: after(3),
    });
  });

  it("échoue ou s'interrompt avec sa raison", () => {
    const failed = running();
    failed.fail("Error : connexion perdue", after(3));
    const interrupted = running();
    interrupted.interrupt("image remplacée", after(4));

    expect(failed.snapshot()).toMatchObject({
      state: "failed",
      failure: "Error : connexion perdue",
    });
    expect(interrupted.snapshot()).toMatchObject({
      state: "interrupted",
      failure: "image remplacée",
    });
  });

  it("refuse toute issue à un passage qui ne tourne pas", () => {
    expect(() => simulated().succeed(DONE, after(1))).toThrow(IllegalPostDeployTransitionError);
    expect(() => simulated().recordProgress(DONE)).toThrow(IllegalPostDeployTransitionError);
    const done = running();
    done.succeed(DONE, after(2));
    expect(() => done.interrupt("image remplacée", after(3))).toThrow(
      IllegalPostDeployTransitionError,
    );
  });

  it("réhydraté, garde l'état lu comme condition d'écriture", () => {
    const run = PostDeployRun.rehydrate(running().snapshot());

    expect(run.persistedState).toBe("running");
  });
});
