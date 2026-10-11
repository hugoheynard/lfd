import type { OperationImage } from "../value-objects/operation-image.js";

/** Une opération qui affiche une image : sa clé, et son image telle qu'elle la porte. */
export interface OperationShowingImage {
  readonly key: string;
  readonly image: OperationImage;
}

/**
 * **Quelles opérations affichent cette image ?**
 *
 * Un port à part d'`OperationReader` (ISP) : son seul lecteur est l'abonné
 * qui réannonce l'image d'une opération quand la médiathèque la remplace ou
 * la redécrit (`on-media-asset-described.ts`, 2026-10-11). Archivées
 * comprises : la copie du commerce en tient une tant qu'un envoi ne l'a pas
 * retirée, et elle compte comme porteur de l'ancienne image.
 */
export abstract class OperationImageUsage {
  /** Les opérations dont l'image est cette URL, par clé ; vide si aucune. */
  abstract operationsShowing(url: string): Promise<readonly OperationShowingImage[]>;
}
