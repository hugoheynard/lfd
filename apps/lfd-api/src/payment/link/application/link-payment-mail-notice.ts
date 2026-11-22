import { Injectable, Logger } from "@nestjs/common";

import { StaffAudienceMail } from "../../../mail/channels/requests/staff-audience-mail.js";
import type { B2bMails } from "../../../mail/channels/templates/b2b-mails.js";
import {
  type CardProviderType,
  declaredCardAccount,
} from "../../../platform/config/card-accounts.js";
import { SYSTEM_PAY_LINK_AUTHOR } from "../../channels/requests/pay-links.js";
import { SubjectSettlements } from "../../channels/subjects/index.js";
import {
  type LinkPaymentReceipt,
  LinkPaymentNotice,
} from "../../card/domain/ports/link-payment-notice.js";
import type { PayLink } from "../domain/entities/pay-link.js";
import { PayLinkOrigins } from "../domain/ports/pay-link-origins.js";
import { PayLinkRepository } from "../domain/ports/pay-link.repository.js";

/** Le nom d'un prestataire, tel que l'équipe le lit. */
const PROVIDER_LABELS: Readonly<Record<CardProviderType, string>> = { stripe: "Stripe" };

/** La création d'un lien, en heure de Paris : « mardi 13 octobre 2026 à 10:00 ». */
const CREATED_ON = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * L'avis `staff.link-payment-received` **à l'équipe**, demandé au bloc `mail`
 * dans la transaction qui enregistre le paiement : il part après validation
 * et se relance seul. Le bloc l'adresse aux rôles et aux membres réglés chez
 * le staff (Admin › Destinataires des avis), une demande par membre ; à
 * défaut, à la boîte de l'équipe ; sans boîte non plus, il ne part pas et le
 * bloc le journalise. La clé, tirée du paiement, ferme un second avis pour le
 * même encaissement.
 *
 * Ce qu'il dit vient du lien (le payeur figé à l'ouverture, l'origine au
 * registre, sa date et son auteur) et du sujet (`describe`) : le bloc ne lit
 * ni le commerce, ni l'annuaire du staff.
 */
@Injectable()
export class LinkPaymentMailNotice extends LinkPaymentNotice {
  private readonly logger = new Logger(LinkPaymentMailNotice.name);

  constructor(
    private readonly links: PayLinkRepository,
    private readonly origins: PayLinkOrigins,
    private readonly settlements: SubjectSettlements,
    private readonly staffMail: StaffAudienceMail,
  ) {
    super();
  }

  async paid(receipt: LinkPaymentReceipt): Promise<void> {
    const link = await this.links.byId(receipt.payLinkId);
    if (link === null) {
      this.logger.warn(
        `Paiement ${receipt.paymentId} : son lien ${receipt.payLinkId} est introuvable, ` +
          "l'équipe n'est pas avisée.",
      );
      return;
    }
    await this.staffMail.sendToStaffAudience({
      template: "staff.link-payment-received",
      data: await this.dataOf(receipt, link),
      subjects: [{ type: "payment", id: receipt.paymentId }],
      idempotencyKey: `mail:payment.link_paid:${receipt.paymentId}`,
    });
  }

  private async dataOf(
    receipt: LinkPaymentReceipt,
    link: PayLink,
  ): Promise<B2bMails["staff.link-payment-received"]> {
    const subject = { type: receipt.subjectType, id: receipt.subjectId };
    const description = (await this.settlements.forType(subject.type)?.describe(subject)) ?? null;
    return {
      amountCents: receipt.amountCents,
      channelLabel: channelOf(receipt.account),
      payerLabel: link.payerLabel,
      applicationLabel: this.origins.find(link.origin)?.label ?? link.origin,
      settledLabel: description?.label ?? "",
      screenPath: description?.link ?? "",
      linkCreatedOn: CREATED_ON.format(link.createdAt),
      linkCreatedAutomatically: link.createdBy === SYSTEM_PAY_LINK_AUTHOR,
      linkAuthorName: link.createdByLabel ?? "",
      refused: receipt.refused,
    };
  }
}

/** « lfc-stripe (Stripe) » ; le nom seul pour un compte que le registre ne déclare plus. */
function channelOf(account: string): string {
  const declared = declaredCardAccount(account);
  return declared === null ? account : `${account} (${PROVIDER_LABELS[declared.provider]})`;
}
