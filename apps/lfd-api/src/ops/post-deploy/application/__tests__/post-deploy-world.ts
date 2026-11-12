import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import type { PostDeployOperation } from "../../../../platform/post-deploy/post-deploy-operation.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ApplyPostDeployOperationCommand } from "../apply-post-deploy-operation.command.js";
import { ApplyPostDeployOperationHandler } from "../apply-post-deploy-operation.handler.js";
import { PostDeployCatalogue } from "../post-deploy-catalogue.js";
import { PostDeployExecution } from "../post-deploy-execution.js";
import { SimulatePostDeployOperationCommand } from "../simulate-post-deploy-operation.command.js";
import { SimulatePostDeployOperationHandler } from "../simulate-post-deploy-operation.handler.js";
import { FixedRevision, InMemoryPostDeployRuns } from "./post-deploy-doubles.js";

/** Les gestes câblés sur des doubles, comme le module les câble. */
export function postDeployWorld(operations: readonly PostDeployOperation[]) {
  const runs = new InMemoryPostDeployRuns();
  const revision = new FixedRevision();
  const clock = new FixedClock(new Date());
  const background = new BackgroundWork();
  const catalogue = new PostDeployCatalogue(operations);
  const simulateHandler = new SimulatePostDeployOperationHandler(
    catalogue,
    runs,
    revision,
    new FixedIdGenerator("run"),
    clock,
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  const applyHandler = new ApplyPostDeployOperationHandler(
    catalogue,
    runs,
    revision,
    clock,
    new PostDeployExecution(runs, clock),
    background,
  );
  let gestures = 0;
  // Sans clé donnée, chaque appel est un clic neuf.
  const freshKey = (): string => `intent-${(gestures += 1)}`;
  return {
    runs,
    revision,
    clock,
    background,
    catalogue,
    simulate: (key: string, actor = "fiche-hugo", intentKey = freshKey()) =>
      simulateHandler.execute(new SimulatePostDeployOperationCommand(key, actor, intentKey)),
    apply: (key: string, actor = "fiche-hugo") =>
      applyHandler.execute(new ApplyPostDeployOperationCommand(key, actor)),
  };
}
