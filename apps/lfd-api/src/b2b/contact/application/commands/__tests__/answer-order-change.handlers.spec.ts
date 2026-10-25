import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerRequestNotFoundError } from "../../../domain/errors/contact-errors.js";
import {
  NotAnOrderChangeRequestError,
  OrderChangeRefusalReasonMissingError,
} from "../../../domain/errors/order-change-errors.js";
import { OrderChangeAppliedEvent } from "../../../domain/order-change.events.js";
import {
  CHANGE,
  LATER,
  contactRequest,
  orderChange,
} from "../../../domain/__tests__/request-fixtures.js";
import { ApplyOrderChangeCommand } from "../apply-order-change.command.js";
import { ApplyOrderChangeHandler } from "../apply-order-change.handler.js";
import { RefuseOrderChangeCommand } from "../refuse-order-change.command.js";
import { RefuseOrderChangeHandler } from "../refuse-order-change.handler.js";
import { Directory, MemoryRequests } from "./contact-doubles.js";
import {
  APPLIED_PREVIOUS_TOTAL_CENTS,
  APPLIED_TOTAL_CENTS,
  RecordingApplier,
  RevisionRefused,
} from "./order-change-doubles.js";

const STAFF = { name: "Camille Durand", role: "commercial" };

function applying(requests: MemoryRequests, applier: RecordingApplier, events: RecordingPublisher) {
  return new ApplyOrderChangeHandler(
    requests,
    applier,
    new Directory(STAFF),
    new FixedClock(LATER),
    events,
    new DirectUnitOfWork(),
  );
}

function refusing(requests: MemoryRequests, events: RecordingPublisher) {
  return new RefuseOrderChangeHandler(
    requests,
    new Directory(STAFF),
    new FixedClock(LATER),
    events,
    new DirectUnitOfWork(),
  );
}

/**
 * Répondre à une demande de modification (plan de modification, M4) :
 * « Appliquer » est une révision au nom de l'équipe, sur la révision de
 * départ ; son refus laisse la demande en attente. « Refuser » ne touche pas
 * la commande. Chaque réponse verrouille la demande d'abord.
 */
describe("ApplyOrderChangeHandler", () => {
  it("verrouille, révise sur la révision de départ au nom de l'équipe, puis enregistre la réponse", async () => {
    const log: string[] = [];
    const requests = new MemoryRequests([orderChange()], log);
    const applier = new RecordingApplier(log);
    const events = new RecordingPublisher();

    const revision = await applying(requests, applier, events).execute(
      new ApplyOrderChangeCommand("q1", "staff_1"),
    );

    expect(revision).toBe(2);
    expect(log).toEqual(["lock q1", "revise o1@1", "save q1"]);
    expect(applier.applied).toEqual([
      { orderId: "o1", staffUserId: "staff_1", baseRevision: 1, change: CHANGE },
    ]);
    expect(requests.saved[0]?.toPersistence().handling?.by.name).toBe("Camille Durand");
    expect(events.factTypes()).toEqual(["order.change_applied"]);
    expect(events.traced[0]).toBeInstanceOf(OrderChangeAppliedEvent);
  });

  it("le fait publié porte les totaux de la révision appliquée, tels qu'elle les rend", async () => {
    const events = new RecordingPublisher();
    await applying(new MemoryRequests([orderChange()]), new RecordingApplier(), events).execute(
      new ApplyOrderChangeCommand("q1", "staff_1"),
    );
    const applied = events.traced[0];
    expect(applied).toBeInstanceOf(OrderChangeAppliedEvent);
    expect(applied instanceof OrderChangeAppliedEvent ? applied.applied : null).toEqual({
      revision: 2,
      totalCents: APPLIED_TOTAL_CENTS,
      previousTotalCents: APPLIED_PREVIOUS_TOTAL_CENTS,
    });
  });

  it("la révision refusée (inscrite entre-temps…) : rien enregistré, la demande reste en attente", async () => {
    const request = orderChange();
    const requests = new MemoryRequests([request]);
    const events = new RecordingPublisher();
    await expect(
      applying(requests, new RecordingApplier([], true), events).execute(
        new ApplyOrderChangeCommand("q1", "staff_1"),
      ),
    ).rejects.toThrow(RevisionRefused);
    expect(requests.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
    expect(request.toPersistence().handling).toBeNull();
  });

  it("refuse une demande déjà répondue sans réviser", async () => {
    const request = orderChange();
    request.refuseChange("Non.", { staffUserId: "s2", name: "Léa", role: "" }, LATER);
    const applier = new RecordingApplier();
    await expect(
      applying(new MemoryRequests([request]), applier, new RecordingPublisher()).execute(
        new ApplyOrderChangeCommand("q1", "staff_1"),
      ),
    ).rejects.toThrow("déjà traitée");
    expect(applier.applied).toHaveLength(0);
  });

  it("refuse une autre demande, et une demande inconnue", async () => {
    const applier = new RecordingApplier();
    await expect(
      applying(new MemoryRequests([contactRequest()]), applier, new RecordingPublisher()).execute(
        new ApplyOrderChangeCommand("q1", "staff_1"),
      ),
    ).rejects.toThrow(NotAnOrderChangeRequestError);
    await expect(
      applying(new MemoryRequests(), applier, new RecordingPublisher()).execute(
        new ApplyOrderChangeCommand("q404", "staff_1"),
      ),
    ).rejects.toThrow(CustomerRequestNotFoundError);
    expect(applier.applied).toHaveLength(0);
  });
});

describe("RefuseOrderChangeHandler", () => {
  it("enregistre le refus et son mot, journalise", async () => {
    const log: string[] = [];
    const requests = new MemoryRequests([orderChange()], log);
    const events = new RecordingPublisher();
    await refusing(requests, events).execute(
      new RefuseOrderChangeCommand("q1", "staff_1", " La fournée est lancée. "),
    );
    expect(log).toEqual(["lock q1", "save q1"]);
    const details = requests.saved[0]?.details;
    expect(details).toMatchObject({
      decision: { kind: "refused", reason: "La fournée est lancée." },
    });
    expect(events.factTypes()).toEqual(["order.change_refused"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      reason: "La fournée est lancée.",
      orderNumber: "ORD-0001",
    });
  });

  it("refuse un refus sans mot", async () => {
    const requests = new MemoryRequests([orderChange()]);
    await expect(
      refusing(requests, new RecordingPublisher()).execute(
        new RefuseOrderChangeCommand("q1", "staff_1", "  "),
      ),
    ).rejects.toThrow(OrderChangeRefusalReasonMissingError);
    expect(requests.saved).toHaveLength(0);
  });
});
