import { InterruptOrphanRuns } from "../interrupt-orphan-runs.js";
import { ScriptedOperation } from "./post-deploy-doubles.js";
import { postDeployWorld } from "./post-deploy-world.js";

/** Une opération dont l'application ne finit jamais : le processus « meurt » dessus. */
function stuck(key: string): ScriptedOperation {
  const operation = new ScriptedOperation(key, 3);
  operation.apply = () => new Promise(() => undefined);
  return operation;
}

describe("InterruptOrphanRuns", () => {
  it("interrompt une application « running » laissée par une autre image", async () => {
    const world = postDeployWorld([stuck("policies")]);
    await world.simulate("policies");
    const orphan = await world.apply("policies");
    world.revision.value = "rev-b";

    const swept = await new InterruptOrphanRuns(world.runs, world.revision, world.clock).execute();

    expect(swept).toBe(1);
    expect(world.runs.rows.get(orphan)?.state).toBe("interrupted");
    expect(world.runs.rows.get(orphan)?.failure).toContain("simulez de nouveau");
  });

  /**
   * Régression : un crash puis un redémarrage sur la MÊME image laissait la
   * ligne `running`, et l'index partiel refusait toute nouvelle application
   * de l'opération (corrigé le 2026-11-01 : `max_instances: 1`).
   */
  it("un crash sur la même image ne bloque plus l'opération", async () => {
    const operation = stuck("policies");
    const world = postDeployWorld([operation]);
    await world.simulate("policies");
    const orphan = await world.apply("policies");

    await new InterruptOrphanRuns(world.runs, world.revision, world.clock).execute();

    expect(world.runs.rows.get(orphan)?.state).toBe("interrupted");
    operation.apply = (run) => ScriptedOperation.prototype.apply.call(operation, run);
    await world.simulate("policies");
    // La première tâche, pendue, ne finit jamais : on n'attend pas `whenIdle`.
    await expect(world.apply("policies")).resolves.toEqual(expect.any(String));
  });
});
