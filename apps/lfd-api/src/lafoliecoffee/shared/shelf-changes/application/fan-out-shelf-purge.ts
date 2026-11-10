import { Logger } from "@nestjs/common";

import { ShelfPurge, type ShelfPurgeRequest } from "../domain/ports/shelf-purge.js";

/**
 * **Une purge regroupée, passée à chaque magasin** — la journalisation de C1,
 * le magasin des rayons pro (C2), Workers Cache du rayon public (C3) : un magasin de
 * plus est une entrée de plus dans la liste, pas une branche (OCP).
 *
 * Chacune est tentée même si une autre échoue ; un échec est journalisé,
 * jamais rejoué — la durée de vie des rayons rattrape (§ 5).
 */
export class FanOutShelfPurge extends ShelfPurge {
  private readonly logger = new Logger(FanOutShelfPurge.name);

  constructor(private readonly purges: readonly ShelfPurge[]) {
    super();
  }

  async purge(request: ShelfPurgeRequest): Promise<void> {
    const settled = await Promise.allSettled(this.purges.map((each) => each.purge(request)));
    for (const result of settled) {
      if (result.status === "rejected") {
        const reason: unknown = result.reason;
        this.logger.warn(
          `Purge des rayons échouée (${request.order.kind}) : la durée de vie des rayons rattrapera. ` +
            `Cause : ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      }
    }
  }
}
