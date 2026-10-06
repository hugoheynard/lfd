import type { IncidentPhotoRef } from "./incident-photos.reader.js";

/**
 * Port de **lecture** de la photo d'un signalement, pour le commercial qui
 * décide (`a-la-porte.md`, B3) — à part du port des tournées (ISP) : son
 * mur n'est pas le même.
 *
 * 🔴 Le mur est dans la requête : le signalement porte sur CET arrêt, l'arrêt
 * a une décision VIVANTE (non rapportée, arrêt ouvert, tournée partie et non
 * rentrée — le critère de « À décider »). Hors de là, `null` : on ne sert pas,
 * sous le droit des commerciaux, la photo d'un problème technique ou d'une
 * tournée passée.
 */
export abstract class DecisionIncidentPhotosReader {
  abstract photoOf(stopId: string, incidentId: string): Promise<IncidentPhotoRef | null>;
}
