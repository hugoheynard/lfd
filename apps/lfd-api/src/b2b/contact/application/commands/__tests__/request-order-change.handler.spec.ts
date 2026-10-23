import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import { RequestAuthorUnknownError } from "../../../domain/errors/contact-errors.js";
import {
  ChangedOrderNotFoundError,
  OrderChangeAlreadyPendingError,
  OrderChangeNotRequestableError,
  OrderChangeReasonMissingError,
  OrderChangeStaleError,
} from "../../../domain/errors/order-change-errors.js";
import { AT, CHANGE, reason } from "../../../domain/__tests__/request-fixtures.js";
import type { ChangeableOrder } from "../../../domain/ports/changeable-order.reader.js";
import { RequestOrderChangeCommand } from "../request-order-change.command.js";
import { RequestOrderChangeHandler } from "../request-order-change.handler.js";
import { Authors, FixedAudiences, MemoryReasons, MemoryRequests } from "./contact-doubles.js";
import { ChangeableOrders, OfferedReasons, PendingChanges } from "./order-change-doubles.js";

const CHANGE_REASON = reason({
  id: "r_change",
  kind: "order_change",
  label: { fr: "Modifier ma commande", en: "", it: "" },
  recipientEmail: "commandes@lfc.fr",
  audience: "both",
  priority: "medium",
});
const LATE: ChangeableOrder = {
  id: "o1",
  number: "CMD-0001",
  companyId: null,
  revision: 1,
  standing: "too_late",
};
const JEAN = { name: "Jean Martin", email: "jean@exemple.fr", phone: "" };

function setup(
  over: {
    readonly order?: ChangeableOrder;
    readonly pending?: readonly string[];
    readonly reasons?: readonly ReturnType<typeof reason>[];
  } = {},
) {
  const requests = new MemoryRequests();
  const events = new RecordingPublisher();
  const reasons = over.reasons ?? [CHANGE_REASON];
  const handler = new RequestOrderChangeHandler(
    new ChangeableOrders({ o1: over.order ?? LATE }),
    new PendingChanges(over.pending),
    new OfferedReasons(reasons),
    new MemoryReasons(...reasons),
    new Authors({ u1: JEAN }),
    new FixedAudiences(),
    requests,
    new FixedIdGenerator("q"),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, requests, events };
}

function ask(revision = 1, userId = "u1", orderId = "o1"): RequestOrderChangeCommand {
  return new RequestOrderChangeCommand(
    orderId,
    { change: { ...CHANGE, lines: [...CHANGE.lines], expectedRevision: revision }, message: "" },
    { userId },
  );
}

/**
 * Demander une modification (plan de modification, M4) : seulement l'heure
 * limite passée, sur la révision vue, une à la fois ; la demande et son fait
 * partent ensemble, le courriel à l'équipe suit.
 */
describe("RequestOrderChangeHandler", () => {
  it("range la demande au motif de la modification, journalise, prévient l'équipe", async () => {
    const { handler, requests, events } = setup();
    const id = await handler.execute(ask());

    expect(id).toBe("q_000001");
    const saved = requests.saved[0];
    expect(saved?.kind).toBe("order_change");
    expect(saved?.pendingOrderChange()).toEqual({
      order: { id: "o1", number: "CMD-0001" },
      baseRevision: 1,
      change: CHANGE,
    });
    expect(saved?.author.email).toBe("jean@exemple.fr");
    expect(events.factTypes()).toEqual(["order.change_requested"]);
    const received = events.published.filter(
      (e): e is CustomerRequestReceivedEvent => e instanceof CustomerRequestReceivedEvent,
    );
    expect(received.map((e) => e.recipientEmail)).toEqual(["commandes@lfc.fr"]);
  });

  it.each<[string, ChangeableOrder["standing"], string]>([
    ["encore modifiable directement", "revisable", "Modifier ma commande"],
    ["close (au plan, carte…)", "closed", "Nous contacter"],
  ])("refuse une commande %s : seul « trop tard » se demande", async (_l, standing, said) => {
    const { handler, requests, events } = setup({ order: { ...LATE, standing } });
    await expect(handler.execute(ask())).rejects.toThrow(OrderChangeNotRequestableError);
    await expect(handler.execute(ask())).rejects.toThrow(said);
    expect(requests.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse une commande hors du mur du client (404)", async () => {
    const { handler } = setup();
    await expect(handler.execute(ask(1, "u1", "o_other"))).rejects.toThrow(
      ChangedOrderNotFoundError,
    );
  });

  it("refuse une demande composée sur une révision dépassée", async () => {
    const { handler, requests } = setup({ order: { ...LATE, revision: 2 } });
    await expect(handler.execute(ask(1))).rejects.toThrow(OrderChangeStaleError);
    expect(requests.saved).toHaveLength(0);
  });

  it("refuse une seconde demande tant que la première attend", async () => {
    const { handler } = setup({ pending: ["o1"] });
    await expect(handler.execute(ask())).rejects.toThrow(OrderChangeAlreadyPendingError);
  });

  it("sans motif « modification » ouvert : refuse en disant à l'équipe quoi créer", async () => {
    const { handler } = setup({ reasons: [] });
    await expect(handler.execute(ask())).rejects.toThrow(OrderChangeReasonMissingError);
  });

  it("refuse un auteur inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(ask(1, "u_ghost"))).rejects.toThrow(RequestAuthorUnknownError);
  });
});
