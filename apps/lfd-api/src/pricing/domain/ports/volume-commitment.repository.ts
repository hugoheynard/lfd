import type { VolumeCommitmentAggregate } from "../entities/volume-commitment.js";

/**
 * Écriture des engagements de volume.
 *
 * Séparé du lecteur pour la même raison que partout ailleurs ici : le chemin qui
 * FACTURE ne lit que des engagements, il n'a aucune raison de dépendre d'un
 * contrat qui sait aussi en signer.
 */
export abstract class VolumeCommitmentRepository {
  /**
   * @throws {OverlappingVolumeCommitmentError} un engagement vivant couvre déjà
   *   cette cible pour ce client sur une partie de la période.
   */
  abstract sign(commitment: VolumeCommitmentAggregate): Promise<void>;

  /** `null` si l'identifiant n'existe pas. */
  abstract load(id: string): Promise<VolumeCommitmentAggregate | null>;

  abstract save(commitment: VolumeCommitmentAggregate): Promise<void>;
}
