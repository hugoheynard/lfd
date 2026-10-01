/** Où est rangée la photo d'un signalement, et de quelle tournée il est. */
export interface IncidentPhotoRef {
  readonly roundId: string;
  readonly photoKey: string;
}

/**
 * Port de **lecture** de la photo d'un signalement — à part des listes (ISP) :
 * seules les deux routes qui servent l'image en ont besoin, et chacune pose
 * son mur sur `roundId`.
 */
export abstract class IncidentPhotosReader {
  /** `null` : signalement inconnu, ou sans photo. */
  abstract photoOf(incidentId: string): Promise<IncidentPhotoRef | null>;
}
