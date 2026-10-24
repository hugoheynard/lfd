import type { AdminOrderRevisability, OrderRevisability } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import type { RevisableOrder, RevisionActor } from "../../domain/entities/order-revision.js";
import { RevisableOrderReader } from "../../domain/ports/revisable-order.reader.js";
import {
  customerRevisionRefusalOf,
  revisionBlockReasonOf,
  type RevisionVerdict,
} from "../../domain/services/order-revisability.js";
import { OrderRevising } from "./order-revising.service.js";

/** Ce que l'équipe lit de la modification d'une commande : le verdict et la révision courante. */
export interface AdminRevisionStanding {
  readonly revisability: AdminOrderRevisability;
  readonly revision: number;
}

/**
 * **La modification, lue pour les vues** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) — la règle du
 * geste (`OrderRevising.revisabilityOf`), avec le jour d'inscription demandé
 * au fournil par son canal, comme l'aperçu de l'annulation. Sans verrou :
 * c'est un affichage. Le mur reste l'affaire de l'appelant.
 */
@Injectable()
export class OrderRevisabilityReading {
  constructor(
    private readonly orders: RevisableOrderReader,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly revising: OrderRevising,
  ) {}

  /** Le verdict pour une commande déjà lue (et déjà passée par son mur). */
  async verdictOf(
    order: RevisableOrder,
    actorKind: RevisionActor["kind"],
  ): Promise<RevisionVerdict> {
    const inscribedDay = await this.inscriptions.inscribedDayOf(order.orderId);
    return this.revising.revisabilityOf(order, actorKind, inscribedDay);
  }

  /** Le verdict de l'équipe, par identifiant ; `null` si la commande est inconnue. */
  async forStaff(orderId: string): Promise<AdminRevisionStanding | null> {
    const order = await this.orders.find(orderId);
    if (order === null) {
      return null;
    }
    const verdict = await this.verdictOf(order, "staff");
    return { revisability: adminRevisabilityOf(verdict), revision: order.revision };
  }
}

/** Le verdict dit au client : un code, et l'heure limite en ISO. */
export function customerRevisabilityOf(verdict: RevisionVerdict): OrderRevisability {
  if (verdict.revisable) {
    return { revisable: true, until: isoOrNull(verdict.until) };
  }
  const until = verdict.block.kind === "past_cutoff" ? verdict.block.until : null;
  return {
    revisable: false,
    code: customerRevisionRefusalOf(verdict.block),
    until: isoOrNull(until),
  };
}

/** Le verdict dit à l'équipe : la phrase du serveur sous le bouton grisé. */
export function adminRevisabilityOf(verdict: RevisionVerdict): AdminOrderRevisability {
  return verdict.revisable
    ? { revisable: true }
    : { revisable: false, reason: revisionBlockReasonOf(verdict.block) };
}

function isoOrNull(at: Date | null): string | null {
  return at === null ? null : at.toISOString();
}
