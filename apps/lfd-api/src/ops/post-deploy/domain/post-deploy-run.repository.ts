import type { PostDeployRun } from "./post-deploy-run.js";

/**
 * **Le port d'écriture des passages** : il prend et rend l'agrégat.
 *
 * `save` est conditionné sur `persistedState` : un passage qui a changé entre
 * la lecture et l'écriture lève `PostDeployRunChangedError`, et une seconde
 * application en cours de la même opération lève `PostDeployAlreadyRunningError`
 * (index unique partiel, § 7.4).
 */
export abstract class PostDeployRunRepository {
  abstract load(id: string): Promise<PostDeployRun | null>;
  /** La simulation la plus récente de cette personne pour cette opération, quel que soit son état. */
  abstract latestSimulationBy(operationKey: string, actor: string): Promise<PostDeployRun | null>;
  /** Les passages en cours d'application — pour le balayage au démarrage. */
  abstract running(): Promise<readonly PostDeployRun[]>;
  abstract save(run: PostDeployRun): Promise<void>;
}
