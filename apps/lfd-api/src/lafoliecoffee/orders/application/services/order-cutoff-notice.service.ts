import { Injectable } from "@nestjs/common";
import type {
  OrderQuoteCutoffView,
  OrderQuoteExceededLimitView,
  OrderQuoteItemLimitLineView,
} from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderDeadline, type OrderDeadlineVerdict } from "../../../order-cutoffs/index.js";
import type { OrderSupply } from "../../domain/value-objects/order-supply.js";
import { exceededViewOf } from "./exceeded-limit-view.js";

/** Ce qu'une commande sur stock lit de l'heure limite : rien ne la ferme (lot L4). */
const SHELF_NOTICE: OrderQuoteCutoffView = {
  status: "open",
  until: null,
  exceeded: [],
  closedByItemLimit: [],
};

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
 *
 * Il dit aussi, pour l'équipe qui en a le droit, les limites de produit que
 * la saisie passerait, et pour chaque ligne fermée par sa propre limite si
 * elle peut la passer — le verdict le juge, l'avis le traduit.
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
    // Le droit de passer outre la limite d'un produit ; faux pour le client.
    exceedItemLimits: boolean,
  ): Promise<OrderQuoteCutoffView> {
    if (supply === "shelf") {
      return SHELF_NOTICE;
    }
    const verdict = await this.deadline.verdict({
      skus,
      serviceDay: fulfillmentDate,
      at: this.clock.now(),
      asker: {
        audience: "pro",
        companyId: null,
        waiver: "ignore",
        exceedItemLimits,
        // L'avis annonce la saisie : la règle générale lui est opposée.
        itemLimitFloor: "general_rule_open",
      },
    });
    const items = {
      exceeded: exceededOf(verdict),
      closedByItemLimit: closedByItemLimitOf(verdict),
    };
    switch (verdict.kind) {
      case "open":
        return { status: "open", until: verdict.limit?.toISOString() ?? null, ...items };
      case "grace":
        return { status: "grace", until: verdict.graceEnd?.toISOString() ?? null, ...items };
      case "closed":
        return { status: "closed", until: null, ...items };
    }
  }
}

function exceededOf(verdict: OrderDeadlineVerdict): readonly OrderQuoteExceededLimitView[] {
  return verdict.exceeded.map(exceededViewOf);
}

/** Les lignes que leur propre limite ferme, dans l'ordre du panier. */
function closedByItemLimitOf(
  verdict: OrderDeadlineVerdict,
): readonly OrderQuoteItemLimitLineView[] {
  return [...verdict.lines].flatMap(([sku, line]) =>
    line.itemStatus === "closed" ? [{ sku, exceedable: line.exceedable }] : [],
  );
}
