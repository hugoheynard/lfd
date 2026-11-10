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
  /**
   * **Les engagements RANGÉS qui recouvrent la fenêtre de celui-ci**, par
   * identifiant.
   *
   * La contrainte d'exclusion est **partielle** (`WHERE archived_at IS NULL`) :
   * elle ne protège que du recouvrement avec un engagement en cours. Depuis que
   * clore BORNE la fenêtre (R17), un engagement rangé garde pourtant sa place dans
   * le passé — et poser par-dessus donnerait deux décisions à la même date.
   *
   * Rend des identifiants, pas des agrégats : l'appelant leur pose une seule
   * question, via `PricedDecisionsReader`. Le refus ne vise que ce qui a
   * **facturé**, jamais ce qui est simplement passé.
   */
  abstract archivedOverlapping(commitment: VolumeCommitmentAggregate): Promise<readonly string[]>;

  abstract sign(commitment: VolumeCommitmentAggregate): Promise<void>;

  /** `null` si l'identifiant n'existe pas. */
  abstract load(id: string): Promise<VolumeCommitmentAggregate | null>;

  abstract save(commitment: VolumeCommitmentAggregate): Promise<void>;
}
