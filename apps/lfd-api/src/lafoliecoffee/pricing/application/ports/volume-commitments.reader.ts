import type { VolumeCommitmentState } from "../../domain/entities/volume-commitment.js";

/** Un engagement rangé : son état, plus l'instant système de sa signature. */
export interface StoredVolumeCommitment {
  readonly state: VolumeCommitmentState;
  readonly createdAt: Date;
}

/**
 * **Port de lecture du suivi des engagements d'un client.**
 *
 * Distinct de `VolumeCommitmentReader`, et la distinction porte : celui-là ne
 * rend que les engagements **vivants**, parce que c'est tout ce qu'un prix peut
 * invoquer. Le suivi, lui, montre aussi les terminés et les rangés — c'est
 * l'écran où l'on regarde si une promesse a été tenue, et une promesse tenue
 * l'est au passé.
 *
 * Les fondre en ajoutant un drapeau au premier aurait mis une question d'écran
 * sur le chemin qui facture.
 */
export abstract class VolumeCommitmentsReader {
  /** Tous les engagements de ce client, du plus récent au plus ancien. */
  abstract allFor(companyId: string): Promise<readonly StoredVolumeCommitment[]>;
}
