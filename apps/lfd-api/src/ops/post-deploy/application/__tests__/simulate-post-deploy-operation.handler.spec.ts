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

  it("refuse une clé inconnue, sans rien tracer", async () => {
    const world = postDeployWorld([]);

    await expect(world.simulate("absente")).rejects.toThrow(UnknownPostDeployOperationError);
    expect(world.runs.rows.size).toBe(0);
  });
});
