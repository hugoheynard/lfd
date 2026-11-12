import {
  PostDeployAlreadyRunningError,
  PostDeployPredecessorPendingError,
  SimulationExpiredError,
  SimulationOfAnotherRevisionError,
  SimulationRequiredError,
  UnknownPostDeployOperationError,
} from "../../domain/post-deploy-errors.js";
import { SIMULATION_FRESHNESS_MINUTES } from "../../domain/post-deploy-run.js";
import { reportOf, ScriptedOperation } from "./post-deploy-doubles.js";
import { postDeployWorld } from "./post-deploy-world.js";

const MINUTE = 60_000;

describe("ApplyPostDeployOperationHandler", () => {
  it("refuse sans simulation : « simulez d'abord »", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);

    await expect(world.apply("policies")).rejects.toThrow(SimulationRequiredError);
  });

  it("refuse la simulation d'une autre personne (il n'y en a aucune à son nom)", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);
    await world.simulate("policies", "fiche-autre");

    await expect(world.apply("policies", "fiche-hugo")).rejects.toThrow(SimulationRequiredError);
  });

  it("refuse une simulation trop ancienne, ou d'une autre image", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);
    await world.simulate("policies");
    world.clock.advanceMs((SIMULATION_FRESHNESS_MINUTES + 1) * MINUTE);

    await expect(world.apply("policies")).rejects.toThrow(SimulationExpiredError);

    await world.simulate("policies");
    world.revision.value = "rev-b";
    await expect(world.apply("policies")).rejects.toThrow(SimulationOfAnotherRevisionError);
  });

  it("refuse une clé inconnue", async () => {
    const world = postDeployWorld([]);

    await expect(world.apply("absente")).rejects.toThrow(UnknownPostDeployOperationError);
  });

  it("applique en tâche, au nom de qui clique, lot par lot, puis réussit", async () => {
    const operation = new ScriptedOperation("policies", 3);
    const world = postDeployWorld([operation]);
    await world.simulate("policies");

    const runId = await world.apply("policies");
    expect(world.runs.rows.get(runId)?.state).toBe("running");
    await world.background.whenIdle();

    expect(operation.actors).toEqual(["fiche-hugo"]);
    expect(world.runs.rows.get(runId)).toMatchObject({
      state: "succeeded",
      progressReport: reportOf(3),
    });
  });

  it("une simulation ne s'applique qu'une fois", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);
    await world.simulate("policies");
    await world.apply("policies");
    await world.background.whenIdle();

    await expect(world.apply("policies")).rejects.toThrow(SimulationRequiredError);
  });

  it("refuse une seconde application en cours de la même opération", async () => {
    const operation = new ScriptedOperation("policies", 3);
    // La première application reste en cours tant que le test ne la libère
    // pas : l'état « running » ne dépend pas de l'ordre des micro-tâches.
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    operation.apply = async (run) => {
      await held;
      return ScriptedOperation.prototype.apply.call(operation, run);
    };
    const world = postDeployWorld([operation]);
    await world.simulate("policies", "fiche-autre");
    await world.apply("policies", "fiche-autre");
    await world.simulate("policies");

    await expect(world.apply("policies")).rejects.toThrow(PostDeployAlreadyRunningError);
    release();
    await world.background.whenIdle();
  });

  it("garde l'échec et sa raison ; ce qui a été écrit lot par lot reste écrit", async () => {
    const operation = new ScriptedOperation("policies", 3);
    operation.failure = new Error("connexion perdue");
    const world = postDeployWorld([operation]);
    await world.simulate("policies");

    const runId = await world.apply("policies");
    await world.background.whenIdle();

    expect(world.runs.rows.get(runId)).toMatchObject({
      state: "failed",
      failure: "Error : connexion perdue",
      progressReport: reportOf(2),
    });
  });

  it("refuse la seconde tant que la première est à faire (§ 7.1)", async () => {
    const first = new ScriptedOperation("policies", 2);
    const world = postDeployWorld([first, new ScriptedOperation("discounts", 5, ["policies"])]);
    await world.simulate("discounts");

    await expect(world.apply("discounts")).rejects.toThrow(PostDeployPredecessorPendingError);

    first.pending = 0;
    await expect(world.apply("discounts")).resolves.toEqual(expect.any(String));
    await world.background.whenIdle();
  });
});
