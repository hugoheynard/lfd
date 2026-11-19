import type { LateFeeAdjustment } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderDeadline } from "../../../order-cutoffs/index.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ShelfCircuit } from "./shelf-circuit.service.js";

/**
 * **La surtaxe que la passation de ce panier facturerait maintenant** — le
 * devis d'une société la prévoit par le même verdict que la passation
 * (plan `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, T1),
 * la dérogation lue sans être dépensée.
 *
 * Rien sans société (une dérogation n'appartient qu'à une société), sans jour
 * (le panier est partiel), ni pour une commande sur stock, que l'heure limite
 * ne juge pas. Ne refuse jamais : passé l'heure sans dérogation, la passation
 * refusera ; le devis ne chiffre rien.
 */
@Injectable()
export class ForeseenLateFee {
  constructor(
    private readonly deadline: OrderDeadline,
    private readonly shelf: ShelfCircuit,
    private readonly clock: Clock,
  ) {}

  async of(
    companyId: string | null,
    skus: readonly string[],
    day: string | null,
  ): Promise<LateFeeAdjustment | null> {
    if (companyId === null || day === null) {
      return null;
    }
    const supply = await this.shelf.decide({ placedByStaffId: null }, day, undefined);
    if (supply.supply !== "planned") {
      return null;
    }
    const verdict = await this.deadline.verdict({
      skus,
      serviceDay: day,
      at: this.clock.now(),
      // La surtaxe prévue du devis de la boutique : jamais l'équipe.
      asker: { audience: "pro", companyId, waiver: "consider", exceedItemLimits: false },
    });
    return verdict.kind === "grace" ? verdict.lateFee : null;
  }
}
