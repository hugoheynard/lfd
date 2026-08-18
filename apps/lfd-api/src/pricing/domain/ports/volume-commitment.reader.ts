import type { VolumeCommitment } from "../volume-commitment.js";

/**
 * Lecture des engagements **vivants** d'un client.
 *
 * Rend les engagements non clos, à charge du domaine de retenir celui qui court
 * à l'instant visé et qui couvre l'article — deux questions que le port n'a pas
 * à trancher, et qui se testent sans base quand elles restent au domaine.
 */
export abstract class VolumeCommitmentReader {
  /**
   * Les engagements non clos de ce client. `[]` pour un client de passage —
   * un engagement vise toujours une société nommée.
   */
  abstract liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]>;
}
