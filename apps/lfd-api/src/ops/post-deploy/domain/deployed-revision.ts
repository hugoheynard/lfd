/**
 * **La révision de l'image qui répond** — un port étroit plutôt qu'`AppConfig`
 * en direct : les gestes se testent sans fabriquer d'environnement.
 */
export abstract class DeployedRevision {
  abstract current(): string;
}
