import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import { AT, orderProblem, photo } from "../../../domain/__tests__/request-fixtures.js";
import {
  CUSTOMER_REQUESTS_LINK,
  RingCustomerRequestReceived,
} from "../ring-customer-request-received.handler.js";

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

function problemEvent(): CustomerRequestReceivedEvent {
  const problem = orderProblem();
  problem.attachPhoto("p1", photo(), AT);
  problem.attachPhoto("p2", photo(), AT);
  return new CustomerRequestReceivedEvent(problem, "sav@lfc.fr");
}

// Le courriel à l'équipe n'est plus un abonné : `CustomerRequestMail` (S2c).
describe("RingCustomerRequestReceived — la cloche", () => {
  it("sonne pour qui lit `b2b_contact`, vers la boîte, sans le nom ni le texte", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();
    new RingCustomerRequestReceived(notifier, work).handle(problemEvent());
    await work.whenIdle();

    expect(notifier.notices).toHaveLength(1);
    const notice = notifier.notices[0];
    expect(notice).toMatchObject({
      kind: "customer_request.received",
      subject: "Signaler un problème — Produit abîmé",
      link: CUSTOMER_REQUESTS_LINK,
      audience: "b2b_contact:read",
      idempotencyKey: "notification:customer_request.received:q1",
    });
    expect(CUSTOMER_REQUESTS_LINK).toBe("/commercial/demandes");
    expect(JSON.stringify(notice)).not.toMatch(/Jean|exemple\.fr|écrasé/u);
  });
});
