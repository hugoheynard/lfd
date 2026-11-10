import type { OperationFocal } from "../../domain/value-objects/operation-image.js";

/**
 * Recadre une image de la médiathèque partout où une opération du commerce la
 * montre — envoyée par la racine de composition quand la médiathèque redécrit
 * l'image (`media.asset_described`). L'opération ne lit pas la médiathèque :
 * elle reçoit le point déjà lu. `focal: null` — retour au centre.
 */
export class RefocusOperationImageCommand {
  constructor(
    readonly url: string,
    readonly focal: OperationFocal | null,
  ) {}
}
