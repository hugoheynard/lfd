import { UnknownPostDeployOperationError } from "../../domain/post-deploy-errors.js";
import { reportOf, ScriptedOperation } from "./post-deploy-doubles.js";
import { postDeployWorld } from "./post-deploy-world.js";

describe("SimulatePostDeployOperationHandler", () => {
  it("simule et trace un passage « simulated » au nom de qui simule, sur l'image courante", async () => {
    const operation = new ScriptedOperation("policies", 3);
    const world = postDeployWorld([operation]);

    const runId = await world.simulate("policies");

    expect(runId).toBe("postdeploy_run_000001");
    expect(operation.actors).toEqual([]);
    expect(world.runs.rows.get(runId)).toMatchObject({
      operationKey: "policies",
      state: "simulated",
      revision: "rev-a",
      simulatedBy: "fiche-hugo",
      simulatedAt: world.clock.now(),
      simulationReport: reportOf(3),
    });
  });

  /** Régression : un double clic sur « Simuler » rangeait deux passages. */
  it("rejouée avec la même clé, rend le même passage sans en ranger un second", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);

    const first = await world.simulate("policies", "fiche-hugo", "cle-1");
    const replay = await world.simulate("policies", "fiche-hugo", "cle-1");

    expect(replay).toBe(first);
    expect(world.runs.rows.size).toBe(1);
  });

  it("une clé neuve range une simulation neuve", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 3)]);

    await world.simulate("policies", "fiche-hugo", "cle-1");
    await world.simulate("policies", "fiche-hugo", "cle-2");

    expect(world.runs.rows.size).toBe(2);
  });

  it("refuse une clé inconnue, sans rien tracer", async () => {
    const world = postDeployWorld([]);

    await expect(world.simulate("absente")).rejects.toThrow(UnknownPostDeployOperationError);
    expect(world.runs.rows.size).toBe(0);
  });
});
