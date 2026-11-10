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

  /**
   * **Les engagements de ce client à un instant PASSÉ** — la relecture.
   *
   * Une seule différence avec {@link liveFor} : les engagements **clos** après
   * `at` sont rendus, parce qu'ils couraient ce jour-là. Clore borne désormais
   * leur fenêtre, donc le domaine sait déjà les écarter à la bonne date — la
   * clause d'archivage, elle, les faisait disparaître (R17).
   *
   * ⚠️ Elle ne filtre toujours **pas** par fenêtre, exactement comme sa jumelle :
   * retenir celui qui court à l'instant visé reste une décision du domaine, et
   * elle se teste sans base tant qu'elle y reste.
   */
  abstract liveAsOf(companyId: string | null, at: Date): Promise<readonly VolumeCommitment[]>;
}
