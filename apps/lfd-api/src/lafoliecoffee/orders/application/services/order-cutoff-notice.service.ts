import { Injectable } from "@nestjs/common";
import type { OrderQuoteCutoffView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderDeadline } from "../../../order-cutoffs/index.js";
import type { OrderSupply } from "../../domain/value-objects/order-supply.js";

/** Ce qu'une commande sur stock lit de l'heure limite : rien ne la ferme (lot L4). */
const SHELF_NOTICE: OrderQuoteCutoffView = { status: "open", until: null };

/**
 * **Ce que l'heure limite dira de ce panier pour ce jour**, sans rien refuser.
 *
 * Le même verdict que la passation (`OrderDeadline`), sans la dérogation : il
 * dit l'état de la journée, pas si ce client passerait pendant le rattrapage.
 * Ouvert, il annonce la limite, rattrapage non compris ; en rattrapage, sa fin ;
 * fermé, rien.
 *
 * Il se sépare sur la marque (plan du jour J, §12, lot L4) : une commande
 * prise sur la vitrine n'a pas d'heure limite — la passation ne lui en
 * oppose aucune —, et l'annoncer « fermée » promettrait un refus qui
 * n'arrivera pas.
 */
@Injectable()
export class OrderCutoffNotice {
  constructor(
    private readonly deadline: OrderDeadline,
    private readonly clock: Clock,
  ) {}

  async forDay(
    skus: readonly string[],
    fulfillmentDate: string,
    supply: OrderSupply,
  ): Promise<OrderQuoteCutoffView> {
    if (supply === "shelf") {
      return SHELF_NOTICE;
    }
    const verdict = await this.deadline.verdict({
      skus,
      serviceDay: fulfillmentDate,
      at: this.clock.now(),
      asker: { audience: "pro", companyId: null, waiver: "ignore", exceedItemLimits: false },
    });
    switch (verdict.kind) {
      case "open":
        return { status: "open", until: verdict.limit?.toISOString() ?? null };
      case "grace":
        return { status: "grace", until: verdict.graceEnd?.toISOString() ?? null };
      case "closed":
        return { status: "closed", until: null };
    }
  }
}
