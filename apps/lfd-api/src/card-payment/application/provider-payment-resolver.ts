import { Injectable, Logger } from "@nestjs/common";

import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { SubjectSettlements, type SubjectClaim } from "../channels/subjects/index.js";
import { CardPayment } from "../domain/entities/card-payment.js";
import { CardPaymentRepository } from "../domain/ports/card-payment.repository.js";
import type { PaymentAccount } from "../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../domain/value-objects/payment-subject.js";

/**
 * **Retrouve le paiement d'une intention annoncée par le prestataire**
 * (plan M2, §4.6) : par sa ligne `(compte, référence)` ; sinon en demandant à
 * chaque implémenteur du canal des sujets s'il la revendique — une intention
 * créée par l'image d'avant le bloc n'a pas de ligne. Celui qui la revendique
 * la fait naître, DANS la transaction de l'appelant, à l'état qu'il déclare.
 * Personne : `null`, l'événement est hors de nos sujets.
 */
@Injectable()
export class ProviderPaymentResolver {
  private readonly logger = new Logger(ProviderPaymentResolver.name);

  constructor(
    private readonly payments: CardPaymentRepository,
    private readonly settlements: SubjectSettlements,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async resolve(account: PaymentAccount, providerRef: string): Promise<CardPayment | null> {
    const known = await this.payments.findByProviderRef(account, providerRef);
    if (known !== null) {
      return known;
    }
    for (const settlement of this.settlements.all()) {
      const claim = await settlement.claim(account.name, providerRef);
      if (claim !== null) {
        return this.adopt(account, providerRef, claim);
      }
    }
    return null;
  }

  private async adopt(
    account: PaymentAccount,
    providerRef: string,
    claim: SubjectClaim,
  ): Promise<CardPayment | null> {
    const payment = CardPayment.adopt(
      {
        id: this.ids.next(),
        subject: PaymentSubject.of(claim.subject.type, claim.subject.id),
        account,
        providerRef,
        role: claim.role,
        amountCents: claim.amountCents,
        at: this.clock.now(),
      },
      claim.settled,
    );
    if (await this.payments.addIfAbsent(payment)) {
      return payment;
    }
    // Une course (un autre webhook l'a adoptée) rend sa ligne ; un sujet qui
    // porte déjà un autre premier paiement n'en rend aucune — l'écart se
    // journalise, et l'événement reste hors de nos sujets.
    const raced = await this.payments.findByProviderRef(account, providerRef);
    if (raced === null) {
      this.logger.warn(
        `Intention ${providerRef} revendiquée par ${payment.subject.toString()} mais non ` +
          "rattachable : le sujet porte déjà un autre premier paiement.",
      );
    }
    return raced;
  }
}
