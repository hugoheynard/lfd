import type { AudienceDimension, AudiencePeriod } from "@lfd/contracts";

/**
 * Les audiences de la clientèle sur les `days` derniers jours métier,
 * aujourd'hui compris — une coupe, ou toutes quand `dimension` est nul (A1).
 */
export class GetAudiencesQuery {
  constructor(
    readonly days: AudiencePeriod,
    readonly dimension: AudienceDimension | null,
  ) {}
}
