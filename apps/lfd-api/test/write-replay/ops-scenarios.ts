import {
  PostDeployOperation,
  type OperationReport,
} from "../../src/platform/post-deploy/post-deploy-operation.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

/** La clé de la reprise semée pour le rejeu. */
const OPERATION = "replay-operation";

/**
 * Une reprise de test, sans rien à écrire : simuler ne lit qu'elle. La liste
 * réelle est vide, le rejeu de « Simuler » demande une opération connue.
 */
class ReplayOperation extends PostDeployOperation {
  readonly key = OPERATION;
  readonly title = "Reprise du rejeu";
  readonly why = "Opération de test du rejeu.";
  readonly limit = "Aucune : opération de test.";
  readonly after: readonly string[] = [];

  simulate(): Promise<OperationReport> {
    return Promise.resolve({ writable: 0, byHand: 0, summary: ["rien"], sample: [] });
  }

  apply(): Promise<OperationReport> {
    return this.simulate();
  }
}

/** Les opérations après déploiement que la suite relie. */
export const REPLAY_POST_DEPLOY_OPERATIONS: readonly PostDeployOperation[] = [
  new ReplayOperation(),
];

/** Les opérations après déploiement : « Simuler » range un passage par intention. */
export const OPS_SCENARIOS: ScenarioSet = {
  [routeKey("ops/post-deploy/http/admin-post-deploy.controller.ts", "simulate")]: () =>
    Promise.resolve({ sub: STAFF, path: `/admin/ops/post-deploy/${OPERATION}/simulate` }),
};
