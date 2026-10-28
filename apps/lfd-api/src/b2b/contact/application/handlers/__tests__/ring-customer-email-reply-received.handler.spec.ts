import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CustomerEmailReplyReceived } from "../../../domain/email-reply.events.js";
import { emailReply } from "../../../domain/__tests__/request-fixtures.js";
import { RingCustomerEmailReplyReceived } from "../ring-customer-email-reply-received.handler.js";
import { CUSTOMER_REQUESTS_LINK } from "../ring-customer-request-received.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

async function ring(earlier: number): Promise<RecordingNotifier> {
  const notifier = new RecordingNotifier();
  const work = new BackgroundWork();
  new RingCustomerEmailReplyReceived(notifier, work).handle(
    new CustomerEmailReplyReceived(emailReply(), earlier),
  );
  await work.whenIdle();
  return notifier;
}

describe("RingCustomerEmailReplyReceived — la cloche des réponses par e-mail", () => {
  it("sonne pour qui lit `b2b_contact`, sans nom, adresse, objet ni texte", async () => {
    const notifier = await ring(0);

    expect(notifier.notices).toHaveLength(1);
    const notice = notifier.notices[0];
    expect(notice).toMatchObject({
      kind: "customer_request.email_reply",
      subject: "Nouvelle réponse d'un client",
      link: CUSTOMER_REQUESTS_LINK,
      audience: "b2b_contact:read",
      idempotencyKey: "notification:customer_request.email_reply:q_mail",
    });
    expect(JSON.stringify(notice)).not.toMatch(/Jean|exemple\.fr|ORD-0001|Merci/u);
  });

  it("au plus une fois par heure et par expéditeur : les suivantes ne sonnent pas", async () => {
    expect((await ring(1)).notices).toEqual([]);
  });
});
