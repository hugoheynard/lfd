import { freeChargeNatureLabel } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type CardSubject,
  type SubjectClaim,
  type SubjectDescription,
  type SubjectPaidOutcome,
  type SubjectReference,
  type SubjectRefundOutcome,
  SubjectSettlement,
} from "../../../../payment/channels/subjects/index.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkNotFoundError } from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { PAYMENT_LINKS_SCREEN, PaymentLinkBell, ringingOf } from "../payment-link-bell.js";
import { FreeChargeRefundOutcomes } from "./free-charge-refund-outcomes.js";
import { FREE_CHARGE_SUBJECT_TYPE } from "./free-charge-subject.js";

/**
 * **La demande de paiement libre, sujet du bloc `payment`** (plan du lien vers un sujet,
 * §5.2 corrigé par §5.6) — l'implémentation `free_charge` du canal retour,
 * reliée par `appBootstrap/card-payment-feed.module.ts`. Chaque méthode qui
 * écrit tourne dans la transaction de `payment`, sous le verrou de la ligne
 * `payment_links` — le même que prend l'annulation (`loadLocked`).
 *
 * - **Payée après annulation** : l'argent est encaissé et gardé, la ligne passe
 *   à `paid` et la cloche sonne — `applied`, jamais `refused` : ce n'est pas
 *   au bloc de rembourser, c'est à l'équipe de décider. La cloche sonne dans
 *   la transaction du webhook : si elle tombe, le webhook se rejoue.
 * - **Refusée par la banque** : rien ne bouge, le client réessaie.
 * - **`claim` / `referencesSince`** : tout paiement d'un lien naît par
 *   `attach`, avec sa ligne ; aucune intention d'avant le bloc à rapprocher.
 */
@Injectable()
export class FreeChargeSettlement extends SubjectSettlement {
  readonly subjectType = FREE_CHARGE_SUBJECT_TYPE;

  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly bell: PaymentLinkBell,
    private readonly refunds: FreeChargeRefundOutcomes,
    private readonly clock: Clock,
  ) {
    super();
  }

  /** Le `FOR UPDATE` de sa ligne `payment_links`. */
  async lockSubject(subject: CardSubject): Promise<void> {
    await this.locked(subject);
  }

  async onPaid(subject: CardSubject): Promise<SubjectPaidOutcome> {
    const link = await this.locked(subject);
    const settlement = link.markPaid(this.clock.now());
    if (settlement === "already_paid") {
      return "already_applied";
    }
    await this.links.save(link);
    if (settlement === "settled_after_cancel") {
      await this.bell.paidAfterCancel(ringingOf(link));
    }
    return "applied";
  }

  /** Rien : la demande de paiement libre reste ouverte, le client réessaie. */
  onPaymentFailed(): Promise<void> {
    return Promise.resolve();
  }

  async onRefundOutcome(subject: CardSubject, outcome: SubjectRefundOutcome): Promise<void> {
    await this.refunds.apply(await this.loaded(subject), outcome);
  }

  /** Vrai si elle est annulée — et pas payée depuis. */
  async isCancelled(subject: CardSubject): Promise<boolean> {
    return (await this.loaded(subject)).isCancelled;
  }

  async describe(subject: CardSubject): Promise<SubjectDescription> {
    const link = await this.loaded(subject);
    return { label: `${headingOf(link)} — ${link.terms.label}`, link: PAYMENT_LINKS_SCREEN };
  }

  claim(): Promise<SubjectClaim | null> {
    return Promise.resolve(null);
  }

  referencesSince(): Promise<readonly SubjectReference[]> {
    return Promise.resolve([]);
  }

  /** @throws {PaymentLinkNotFoundError} aucune demande de paiement libre sous cet identifiant. */
  private async locked(subject: CardSubject): Promise<PaymentLink> {
    const link = await this.links.loadLocked(subject.id);
    if (link === null) {
      throw new PaymentLinkNotFoundError(subject.id);
    }
    return link;
  }

  /** @throws {PaymentLinkNotFoundError} aucune demande de paiement libre sous cet identifiant. */
  private async loaded(subject: CardSubject): Promise<PaymentLink> {
    const link = await this.links.load(subject.id);
    if (link === null) {
      throw new PaymentLinkNotFoundError(subject.id);
    }
    return link;
  }
}

/** La nature de la demande quand elle est posée ; « Paiement libre » pour une demande d'avant le registre. */
function headingOf(link: PaymentLink): string {
  return link.nature === null ? "Paiement libre" : freeChargeNatureLabel(link.nature);
}
