import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import type { IncreaseOrderLabel } from "./card-increase-facts.js";

/** Les incidents d'un projet de hausse qui appellent un humain (plan S2, §2.6, §2.7, R11). */
export type CardIncreaseAttention = "stalled" | "provider_unreachable" | "partly_returned";

const SUBJECTS: Readonly<Record<CardIncreaseAttention, string>> = {
  stalled: "Un complément payé n'a pas pu être appliqué",
  provider_unreachable: "Le paiement d'un complément ne peut pas être vérifié",
  partly_returned: "Complément rendu en partie ailleurs",
};

const GESTURES: Readonly<Record<CardIncreaseAttention, string>> = {
  stalled:
    "Le client a payé, mais la modification échoue à répétition. Ouvrez la commande et relancez ; " +
    "si elle échoue encore, prévenez l'équipe technique.",
  provider_unreachable:
    "Le prestataire de carte ne répond pas à nos vérifications. Le système réessaie tout seul ; " +
    "si cela dure, comparez avec le tableau de bord du prestataire.",
  partly_returned:
    "Une partie du complément avait déjà été remboursée par l'équipe : seul le reste est rendu. " +
    "Vérifiez sur la fiche que le client a bien récupéré tout le complément.",
};

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CENTS_PER_EURO = 100;

/**
 * **La cloche des projets de hausse** — sans destinataire nommé, visible de
 * tout le back-office, comme celle des remboursements. Une clé par projet et
 * par incident (et par passage en panne) : un rejeu ne sonne pas deux fois. Écrite dans la transaction
 * de l'appelant.
 */
@Injectable()
export class CardIncreaseBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async ring(
    proposal: CardIncreaseProposal,
    order: IncreaseOrderLabel,
    attention: CardIncreaseAttention,
  ): Promise<void> {
    // Un projet relancé peut retomber en panne : chaque passage `stalled` sonne,
    // une seule fois (il s'écrit dans la transaction conditionnée qui le pose).
    const occurrence = attention === "stalled" ? `:${this.clock.now().toISOString()}` : "";
    await this.notifier.notify([
      {
        kind: `order.card_increase_${attention}`,
        subject: `${SUBJECTS[attention]} — ${order.orderNumber}`,
        body:
          `Commande ${order.orderNumber}, complément de ${euros(proposal.complementCents)}. ` +
          GESTURES[attention],
        link: `/commandes/${order.orderId}`,
        idempotencyKey: `notification:order.card_increase_${attention}:${proposal.id}${occurrence}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}

function euros(cents: number): string {
  return EUROS.format(cents / CENTS_PER_EURO);
}
