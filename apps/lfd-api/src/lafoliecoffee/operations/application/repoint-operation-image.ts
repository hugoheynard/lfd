import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import {
  OperationImageRepointing,
  type OperationImageChange,
} from "../channels/media/operation-image-repointing.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";

/**
 * Les opérations du commerce répondent au remplacement d'une image :
 * charger chacune, la repointer par l'agrégat, la sauver (CLAUDE.md §3.1) —
 * dans la transaction de la médiathèque, qui emporte tous les porteurs ou
 * aucun.
 *
 * Pas de fait `catalog_operation.*` : le geste est `media_asset.replaced`,
 * tracé par la médiathèque avant d'appeler (le laissez-passer en témoigne).
 */
@Injectable()
export class RepointOperationImage extends OperationImageRepointing {
  constructor(private readonly operations: OperationRepository) {
    super();
  }

  /**
   * `_ticket` n'est pas lu : il PROUVE que l'appelant a tracé le
   * remplacement — même forme que `RepointStorefrontImage`.
   */
  async repoint(change: OperationImageChange, _ticket: WriteTicket): Promise<number> {
    const showing = await this.operations.loadShowingImage(change.from);
    let repointed = 0;
    for (const operation of showing) {
      if (operation.followImageReplacement(change.from, change.to)) {
        await this.operations.save(operation);
        repointed += 1;
      }
    }
    return repointed;
  }
}
