/**
 * Les lots d'audience déjà comptés, par leur identifiant tiré à l'écran : un
 * lot rejoué par le réseau ne compte pas deux fois.
 *
 * Ce n'est qu'une mesure d'audience : le registre peut oublier (redémarrage,
 * seconde instance), et un rejeu tombé dans l'oubli compte alors double, comme
 * avant. Il ne garde aucune donnée sur le visiteur — un identifiant neuf par lot.
 */
export abstract class AudienceBatchLedger {
  /** Réserve le lot ; `false` s'il est déjà compté (ou en train de l'être). */
  abstract claim(batchId: string): boolean;

  /** Le comptage a échoué : le lot se recomptera s'il revient. */
  abstract release(batchId: string): void;
}
