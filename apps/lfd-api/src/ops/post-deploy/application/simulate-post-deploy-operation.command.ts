/**
 * Simuler une opération après déploiement : lecture seule côté données,
 * mais le passage est tracé (`simulated`) — c'est lui qu'« Appliquer » exige.
 */
export class SimulatePostDeployOperationCommand {
  constructor(
    readonly operationKey: string,
    /** La fiche staff qui simule. */
    readonly actor: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne range qu'un passage, et le rejeu rend le même identifiant.
     */
    readonly intentKey: string,
  ) {}
}
