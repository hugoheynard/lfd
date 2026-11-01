import type { PostDeployRunSnapshot } from "./post-deploy-run.js";

/** **Le port de lecture des passages** — l'écran les relit, il n'y écrit pas. */
export abstract class PostDeployRunReader {
  /** Le dernier passage de chaque opération demandée, toutes personnes confondues. */
  abstract latestOf(
    operationKeys: readonly string[],
  ): Promise<ReadonlyMap<string, PostDeployRunSnapshot>>;
  abstract byId(id: string): Promise<PostDeployRunSnapshot | null>;
}
