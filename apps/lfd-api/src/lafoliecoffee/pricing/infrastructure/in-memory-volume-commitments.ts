import { VolumeCommitmentReader } from "../domain/ports/volume-commitment.reader.js";
import type { VolumeCommitment } from "../domain/volume-commitment.js";

/**
 * Les engagements vivants en mémoire, pour les suites d'application : rend
 * ceux de la société demandée, sans filtre de fenêtre — comme l'adaptateur,
 * qui laisse ce tri au domaine.
 */
export class InMemoryVolumeCommitments extends VolumeCommitmentReader {
  constructor(private readonly commitments: readonly VolumeCommitment[] = []) {
    super();
  }

  liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    return Promise.resolve(this.commitments.filter((entry) => entry.companyId === companyId));
  }

  liveAsOf(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    return this.liveFor(companyId);
  }
}
