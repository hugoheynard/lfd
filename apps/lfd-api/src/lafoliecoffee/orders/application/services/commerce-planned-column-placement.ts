import { Injectable } from "@nestjs/common";

import {
  PlannedColumnPlacement,
  type PlannedColumnPlacementOutcome,
  type PlannedColumnPlacementRequest,
} from "../../../../recurring/channels/commerce/index.js";
import { PLANNED_BUYER_LEFT, PLANNED_PUBLIC_PAYER } from "./planned-column-refusals.js";
import { UnattendedOrderPlacement } from "./unattended-order-placement.js";

/**
 * **Passe une colonne du planificateur** — l'implémentation, par le commerce,
 * du port que le planificateur déclare (plan du planificateur, § 5), par la
 * passation même des échéances récurrentes ({@link UnattendedOrderPlacement}) :
 * même garde de l'acheteur, même politique sans passe-droit, au compte. La
 * colonne fige les CGV en vigueur, comme un client qui clique « Commander ».
 *
 * **Une colonne, au plus une commande**, tenu par l'index
 * `orders_one_per_planned_column` : un rejeu rend la commande déjà passée.
 * Un refus n'est jamais « final » ici : pour le planificateur, tout refus est
 * définitif (Q2).
 */
@Injectable()
export class CommercePlannedColumnPlacement extends PlannedColumnPlacement {
  constructor(private readonly unattended: UnattendedOrderPlacement) {
    super();
  }

  async place(request: PlannedColumnPlacementRequest): Promise<PlannedColumnPlacementOutcome> {
    const guarded = await this.unattended.buyerRefusal(request.companyId, request.buyerUserId);
    if (guarded !== null) {
      const refusal = guarded === "public_payer" ? PLANNED_PUBLIC_PAYER : PLANNED_BUYER_LEFT;
      return { kind: "refused", ...refusal };
    }
    const outcome = await this.unattended.place({
      companyId: request.companyId,
      buyerUserId: request.buyerUserId,
      serviceDay: request.serviceDay,
      routing: request.routing,
      lines: request.lines,
      note: "",
      salesTerms: null,
      provenance: { plannedColumnId: request.columnId },
    });
    return outcome.kind === "placed"
      ? outcome
      : { kind: "refused", cause: outcome.cause, reason: outcome.reason };
  }
}
