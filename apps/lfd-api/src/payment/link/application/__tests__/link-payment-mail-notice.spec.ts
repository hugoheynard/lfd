import { OpenableUnitOfWork } from "../../../../mail/channels/requests/__tests__/recording-mail.js";
import { RecordingStaffAudienceMail } from "../../../../mail/channels/requests/__tests__/recording-staff-audience-mail.js";
import { SYSTEM_PAY_LINK_AUTHOR } from "../../../channels/requests/pay-links.js";
import { RegisteredSubjectSettlements } from "../../../channels/subjects/index.js";
import {
  TestSubjectSettlement,
  Timeline,
} from "../../../card/application/__tests__/card-payment-doubles.js";
import type { LinkPaymentReceipt } from "../../../card/domain/ports/link-payment-notice.js";
import { PayLink } from "../../domain/entities/pay-link.js";
import { LinkPaymentMailNotice } from "../link-payment-mail-notice.js";
import { FixedOrigins, InMemoryPayLinks, LFC_ORIGIN } from "./pay-link-doubles.js";

/** L'instant de création du lien : mis en forme, jamais comparé à l'horloge. */
const CREATED_AT = new Date("2030-01-15T09:00:00.000Z");
const uow = new OpenableUnitOfWork();

const RECEIPT: LinkPaymentReceipt = {
  paymentId: "pay_1",
  payLinkId: "link_1",
  subjectType: "order",
  subjectId: "ord_1",
  account: "lfc-stripe",
  amountCents: 12_345,
  refused: false,
};

function linkBy(by: string, byLabel: string | null): PayLink {
  return PayLink.open({
    id: "link_1",
    subjectType: "order",
    subjectId: "ord_1",
    origin: "lafoliecoffee",
    payerLabel: "Café des Arts",
    tokenHash: "hash:tok",
    tokenSealed: "sealed:tok",
    at: CREATED_AT,
    by,
    byLabel,
  });
}

async function notify(
  link: PayLink | null,
  receipt: LinkPaymentReceipt = RECEIPT,
): Promise<RecordingStaffAudienceMail> {
  const links = new InMemoryPayLinks();
  if (link !== null) {
    await links.addIfAbsent(link);
  }
  const mails = new RecordingStaffAudienceMail(uow);
  const notice = new LinkPaymentMailNotice(
    links,
    new FixedOrigins([LFC_ORIGIN]),
    new RegisteredSubjectSettlements([new TestSubjectSettlement(new Timeline())]),
    mails,
  );
  await uow.run(() => notice.paid(receipt));
  return mails;
}

describe("LinkPaymentMailNotice — l'avis à l'équipe d'un paiement par lien", () => {
  it("demande staff.link-payment-received à l'équipe, clé tirée du paiement", async () => {
    const mails = await notify(linkBy("staff_1", "Jeanne Martin"));

    expect(mails.queued).toHaveLength(1);
    expect(mails.queued[0]).not.toHaveProperty("to");
    expect(mails.queued[0]).toMatchObject({
      template: "staff.link-payment-received",
      data: {
        amountCents: 12_345,
        channelLabel: "lfc-stripe (Stripe)",
        payerLabel: "Café des Arts",
        applicationLabel: "La Folie Coffee",
        linkCreatedAutomatically: false,
        linkAuthorName: "Jeanne Martin",
        refused: false,
      },
      subjects: [{ type: "payment", id: "pay_1" }],
      idempotencyKey: "mail:payment.link_paid:pay_1",
    });
    expect(mails.queued[0]?.idempotencyKey).not.toContain("@");
  });

  it("un lien du système se dit créé automatiquement, sans nom", async () => {
    const mails = await notify(linkBy(SYSTEM_PAY_LINK_AUTHOR, null));

    expect(mails.queued[0]?.data).toMatchObject({
      linkCreatedAutomatically: true,
      linkAuthorName: "",
    });
  });

  it("un membre dont la fiche était introuvable reste sans nom, jamais inventé", async () => {
    const mails = await notify(linkBy("staff_x", null));

    expect(mails.queued[0]?.data).toMatchObject({
      linkCreatedAutomatically: false,
      linkAuthorName: "",
    });
  });

  it("dit le refus du sujet", async () => {
    const mails = await notify(linkBy("staff_1", "Jeanne Martin"), {
      ...RECEIPT,
      refused: true,
    });

    expect(mails.queued[0]?.data).toMatchObject({ refused: true });
  });
});
