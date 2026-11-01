import { ListPostDeployOperationsHandler } from "../list-post-deploy-operations.handler.js";
import { InMemoryPostDeployRunReader, reportOf, ScriptedOperation } from "./post-deploy-doubles.js";
import { postDeployWorld } from "./post-deploy-world.js";

function listOf(world: ReturnType<typeof postDeployWorld>) {
  return new ListPostDeployOperationsHandler(
    world.catalogue,
    new InMemoryPostDeployRunReader(world.runs),
    world.revision,
  ).execute();
}

describe("ListPostDeployOperationsHandler", () => {
  it("« rien à faire » quand aucune simulation ne trouve à écrire — et aucun passage tracé", async () => {
    const world = postDeployWorld([new ScriptedOperation("policies", 0)]);

    const overview = await listOf(world);

    expect(overview).toMatchObject({ revision: "rev-a", anyToDo: false });
    expect(overview.operations[0]).toMatchObject({
      key: "policies",
      toDo: false,
      current: reportOf(0),
      lastRun: null,
    });
    expect(world.runs.rows.size).toBe(0);
  });

  it("les cas à trancher à la main ne tiennent pas l'opération ouverte", async () => {
    const operation = new ScriptedOperation("policies", 0);
    operation.simulate = () => Promise.resolve(reportOf(0, 4));
    const world = postDeployWorld([operation]);

    expect((await listOf(world)).anyToDo).toBe(false);
  });

  it("dit ce qui est à faire, ce qui bloque, et le dernier passage, dans l'ordre", async () => {
    const world = postDeployWorld([
      new ScriptedOperation("policies", 2),
      new ScriptedOperation("discounts", 5, ["policies"]),
    ]);
    const runId = await world.simulate("policies");

    const overview = await listOf(world);

    expect(overview.anyToDo).toBe(true);
    expect(overview.operations.map((operation) => operation.key)).toEqual([
      "policies",
      "discounts",
    ]);
    expect(overview.operations[0]?.lastRun).toMatchObject({ id: runId, state: "simulated" });
    expect(overview.operations[1]).toMatchObject({ toDo: true, blockedBy: ["policies"] });
  });
});
