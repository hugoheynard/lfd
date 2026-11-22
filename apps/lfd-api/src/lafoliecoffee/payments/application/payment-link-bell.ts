import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { PaymentLink } from "../domain/entities/payment-link.js";
import { PaymentLinkCompanyReader } from "../domain/ports/payment-link-company.reader.js";

/** Où l'équipe ouvre les liens libres. */
export const PAYMENT_LINKS_SCREEN = "/comptabilite/liens-de-paiement";

/** Comment une cloche désigne la demande de paiement libre qui a sonné. */
export interface RingingPaymentLink {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
}

/** Ce qu'un remboursement raté a laissé : le `re_…` ou l'essai, et la somme. */
export interface FailedPaymentLinkRefund {
  /** Ce qui distingue CE remboursement d'un autre — la clé de la cloche. */
  readonly reference: string;
  /** `null` pour un essai d'émission, qui ne dit pas sa somme. */
  readonly amountCents: number | null;
}

/**
 * **Les cloches d'une demande de paiement libre** — partagées par le webhook d'un ancien
 * lien, le sujet `free_charge` et l'abonné de l'annulation : le même cas
 * sonne la même cloche, sous la même clé, quel que soit le chemin qui le
 * découvre. La clé dédoublonne : un cas vu deux fois sonne une fois.
 */
@Injectable()
export class PaymentLinkBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Payée après annulation : l'argent est encaissé, l'équipe croyait le lien
   * retiré — c'est elle qui rembourse ou impute.
   */
  async paidAfterCancel(link: RingingPaymentLink): Promise<void> {
    await this.notifier.notify([
      {
        kind: "payment_link.paid_after_cancel",
        subject: `Lien annulé mais payé — ${await this.companyName(link)}`,
        body:
          `Le lien « ${link.label} » avait été annulé, et le client l'a payé quand même. ` +
          "L'argent est encaissé : à rembourser ou à imputer.",
        link: PAYMENT_LINKS_SCREEN,
        idempotencyKey: `notification:payment_link.paid_after_cancel:${link.id}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }

  /** Un remboursement de la demande de paiement libre n'a pas rendu l'argent. */
  async refundFailed(link: RingingPaymentLink, refund: FailedPaymentLinkRefund): Promise<void> {
    await this.notifier.notify([
      {
        kind: "payment_link.refund_failed",
        subject: `Remboursement non abouti — ${await this.companyName(link)}`,
        body:
          `Un remboursement${refund.amountCents === null ? "" : ` de ${euros(refund.amountCents)}`} ` +
          `sur le lien « ${link.label} » n'a ` +
          "pas rendu l'argent au client : à vérifier dans le tableau de bord du prestataire, " +
          "puis à refaire.",
        link: PAYMENT_LINKS_SCREEN,
        idempotencyKey: `notification:payment_link.refund_failed:${refund.reference}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }

  private async companyName(link: RingingPaymentLink): Promise<string> {
    // La clé étrangère garantit la société ; l'id en repli ne sert qu'à ne
    // jamais écrire un sujet vide si la lecture échouait à la nommer.
    return (await this.companies.nameOf(link.companyId)) ?? link.companyId;
  }
}

/** La désignation d'un lien pour ses cloches. */
export function ringingOf(link: PaymentLink): RingingPaymentLink {
  return { id: link.id, companyId: link.companyId, label: link.terms.label };
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
