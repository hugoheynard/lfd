import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerRequest } from "../../../domain/customer-request.js";
import {
  CustomerRequestAlreadyHandledError,
  CustomerRequestNotFoundError,
} from "../../../domain/errors/contact-errors.js";
import {
  AT,
  LATER,
  contactRequest,
  orderProblem,
} from "../../../domain/__tests__/request-fixtures.js";
import { MarkCustomerRequestHandledCommand } from "../mark-customer-request-handled.command.js";
import { MarkCustomerRequestHandledHandler } from "../mark-customer-request-handled.handler.js";
import { Directory, MemoryRequests } from "./contact-doubles.js";

function handler(
  requests: MemoryRequests,
  events: RecordingPublisher,
): MarkCustomerRequestHandledHandler {
  return new MarkCustomerRequestHandledHandler(
    requests,
    new Directory({ name: "Camille Durand", role: "admin" }),
    new FixedClock(LATER),
    events,
    new DirectUnitOfWork(),
  );
}

describe("MarkCustomerRequestHandledHandler", () => {
  it.each<[string, () => CustomerRequest]>([
    ["« Nous écrire »", () => contactRequest()],
    ["un signalement", () => orderProblem()],
  ])("traite %s : auteur figé, enregistré, journalisé", async (_label, build) => {
    const requests = new MemoryRequests([build()]);
    const events = new RecordingPublisher();
    await handler(requests, events).execute(new MarkCustomerRequestHandledCommand("q1", "staff_1"));

    expect(requests.saved[0]?.toPersistence().handling).toEqual({
      at: LATER,
      by: { staffUserId: "staff_1", name: "Camille Durand", role: "admin" },
    });
    expect(events.factTypes()).toEqual(["customer_request.handled"]);
  });

  it("refuse un second traitement : rien enregistré, rien journalisé", async () => {
    const request = contactRequest();
    request.markHandled({ staffUserId: "staff_2", name: "Léa", role: "commercial" }, AT);
    const requests = new MemoryRequests([request]);
    const events = new RecordingPublisher();
    await expect(
      handler(requests, events).execute(new MarkCustomerRequestHandledCommand("q1", "staff_1")),
    ).rejects.toThrow(CustomerRequestAlreadyHandledError);
    expect(requests.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse une demande inconnue", async () => {
    await expect(
      handler(new MemoryRequests(), new RecordingPublisher()).execute(
        new MarkCustomerRequestHandledCommand("q404", "staff_1"),
      ),
    ).rejects.toThrow(CustomerRequestNotFoundError);
  });
});
