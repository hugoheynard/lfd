import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { CardSubject, SubjectSettlement } from "../../channels/subjects/index.js";

/**
 * Les incidents d'un remboursement qui appellent un humain (plan M2, §3.3,
 * §6.2). Aucune cloche quand tout va bien ; une seule par incident.
 */
export type CardRefundAttentionCause =
  | "unavailable"
  | "declined"
  | "nothing_left"
  | "no_intent"
  | "failed"
  | "reversed"
  | "amount_mismatch";

/** Les incidents d'un remboursement SANS demande : un `re_…` fait hors de la plateforme. */
export type CardRefundOrphanCause = "reversed" | "unattributed";

const SUBJECTS: Readonly<Record<CardRefundAttentionCause, string>> = {
  unavailable: "Remboursement pas encore envoyé au prestataire",
  declined: "Remboursement refusé par le prestataire",
  nothing_left: "Rien à rembourser chez le prestataire — à vérifier",
  no_intent: "Remboursement impossible : aucun paiement chez le prestataire",
  failed: "Remboursement échoué — à traiter",
  reversed: "Remboursement annulé par la banque après coup — à traiter",
  amount_mismatch: "Remboursement émis pour un autre montant — à vérifier",
};

const GESTURES: Readonly<Record<CardRefundAttentionCause, string>> = {
  unavailable:
    "Le prestataire n'a pas répondu. Le système réessaie tout seul ; si cela dure, ouvrez-la et relancez.",
  declined:
    "Rejouer n'y changera rien : remboursez autrement (virement), puis dites-le « rendu autrement ».",
  nothing_left:
    "Le prestataire dit le paiement déjà rendu, mais notre carnet ne le sait pas : comparez avec son tableau de bord.",
  no_intent:
    "Le paiement n'a pas de référence chez le prestataire : remboursez autrement, puis dites-le « rendu autrement ».",
  failed:
    "La banque a refusé le remboursement (carte fermée ?). Relancez, ou remboursez par virement et dites-le « rendu autrement ».",
  reversed:
    "L'argent rendu est revenu chez nous. Relancez, ou remboursez par virement et dites-le « rendu autrement ».",
  amount_mismatch:
    "Le prestataire a émis un autre montant que celui demandé : comparez avec son tableau de bord avant d'agir.",
};

const ORPHANS: Readonly<Record<CardRefundOrphanCause, { subject: string; gesture: string }>> = {
  reversed: {
    subject: "Remboursement fait hors plateforme, annulé par la banque",
    gesture: "Vérifiez le paiement dans le tableau de bord du prestataire.",
  },
  unattributed: {
    subject: "Remboursement fait hors plateforme",
    gesture:
      "Il a été fait depuis le tableau de bord du prestataire : il est noté, vérifiez qu'il était voulu.",
  },
};

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CENTS_PER_EURO = 100;

/** Une demande en incident : son identité, et ce qu'elle annonçait. */
export interface CardRefundAttention {
  readonly settlement: SubjectSettlement;
  readonly subject: CardSubject;
  readonly requestId: string;
  readonly generation: number;
  readonly amountCents: number;
  readonly cause: CardRefundAttentionCause;
}

/** Un `re_…` sans demande, en incident. */
export interface CardRefundOrphanAttention {
  readonly settlement: SubjectSettlement;
  readonly subject: CardSubject;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly cause: CardRefundOrphanCause;
}

/**
 * **La cloche de `card-payment`** (plan M2, §3.3, §6.2) — sans destinataire
 * nommé, visible de tout le back-office ; libellée et liée par le sujet
 * (`describe`), le bloc ne sachant pas ce qu'est une commande. Une clé par
 * demande, génération et cause — `notification:card_payment.refund_attention:
 * <requestId>:<generation>:<cause>` — pour qu'un rejeu ne sonne pas deux fois ;
 * une par `re_…` pour un remboursement sans demande. Écrite dans la
 * transaction de l'appelant.
 */
@Injectable()
export class CardRefundBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async ring(attention: CardRefundAttention): Promise<void> {
    const { settlement, subject, requestId, generation, cause } = attention;
    const { label, link } = await settlement.describe(subject);
    await this.notifier.notify([
      {
        kind: "card_payment.refund_attention",
        subject: `${SUBJECTS[cause]} — ${label}`,
        body: `${label}, remboursement de ${euros(attention.amountCents)}. ${GESTURES[cause]}`,
        link,
        idempotencyKey: `notification:card_payment.refund_attention:${requestId}:${String(generation)}:${cause}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }

  async ringOrphan(attention: CardRefundOrphanAttention): Promise<void> {
    const { settlement, subject, providerRef, cause } = attention;
    const { label, link } = await settlement.describe(subject);
    const words = ORPHANS[cause];
    await this.notifier.notify([
      {
        kind: "card_payment.refund_attention",
        subject: `${words.subject} — ${label}`,
        body: `${label}, remboursement de ${euros(attention.amountCents)}. ${words.gesture}`,
        link,
        idempotencyKey: `notification:card_payment.refund_${cause}:${subject.type}:${subject.id}:${providerRef}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}

function euros(cents: number): string {
  return EUROS.format(cents / CENTS_PER_EURO);
}
