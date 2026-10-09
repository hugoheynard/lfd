import { Buffer } from "node:buffer";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import {
  InvalidRequestPhotoError,
  OrderNotYetFulfilledError,
  ReportedOrderNotFoundError,
  RequestAuthorUnknownError,
  RequestReasonUnavailableError,
  TooManyRequestPhotosError,
} from "../../../domain/errors/contact-errors.js";
import { AT, pngOf, reason } from "../../../domain/__tests__/request-fixtures.js";
import type { ReportableOrder } from "../../../domain/ports/reportable-order.reader.js";
import { ReportOrderProblemCommand } from "../report-order-problem.command.js";
import { ReportOrderProblemHandler } from "../report-order-problem.handler.js";
import {
  Authors,
  FixedAudiences,
  MemoryPhotoStore,
  MemoryReasons,
  MemoryRequests,
  VisibleOrders,
} from "./contact-doubles.js";

const DAMAGED = reason({
  id: "r_damaged",
  kind: "order_problem",
  label: { fr: "Produit abîmé", en: "", it: "" },
  audience: "both",
  priority: "medium",
});
const FULFILLED: ReportableOrder = { id: "o1", number: "CMD-0001", fulfilled: true };
const PENDING: ReportableOrder = { id: "o2", number: "CMD-0002", fulfilled: false };
const JEAN = { name: "Jean Martin", email: "jean@exemple.fr", phone: "" };
const ME = { userId: "u1", companyId: null };

function setup(...reasons: ReturnType<typeof reason>[]): {
  handler: ReportOrderProblemHandler;
  requests: MemoryRequests;
  store: MemoryPhotoStore;
  events: RecordingPublisher;
  log: string[];
} {
  const log: string[] = [];
  const requests = new MemoryRequests([], log);
  const store = new MemoryPhotoStore(log);
  const events = new RecordingPublisher();
  const handler = new ReportOrderProblemHandler(
    new VisibleOrders({ o1: FULFILLED, o2: PENDING }),
    new MemoryReasons(...(reasons.length === 0 ? [DAMAGED] : reasons)),
    new Authors({ u1: JEAN }),
    new FixedAudiences(),
    requests,
    store,
    new FixedIdGenerator("q"),
    new FixedClock(AT),
    events,
  );
  return { handler, requests, store, events, log };
}

function report(
  orderId: string,
  photos: readonly Buffer[] = [],
  actor = ME,
): ReportOrderProblemCommand {
  return new ReportOrderProblemCommand(
    orderId,
    { reasonId: "r_damaged", message: "Le pain était écrasé." },
    photos,
    actor,
  );
}

describe("ReportOrderProblemHandler — signaler un problème", () => {
  it("range la demande avec la commande, l'auteur PRIS AU COMPTE, et publie sa réception", async () => {
    const { handler, requests, events } = setup();
    const id = await handler.execute(report("o1"));

    expect(id).toBe("q_000001");
    expect(requests.saved[0]?.toPersistence()).toMatchObject({
      author: JEAN,
      audience: "b2c",
      userId: "u1",
      details: { kind: "order_problem", order: { id: "o1", number: "CMD-0001" }, photos: [] },
    });
    expect(events.published[0]).toBeInstanceOf(CustomerRequestReceivedEvent);
    expect(events.published[0]).toMatchObject({ recipientEmail: "commercial@lfc.fr" });
  });

  it("range les photos AVANT la demande, sous `requests/<id>/…`", async () => {
    const { handler, requests, store, log } = setup();
    await handler.execute(report("o1", [pngOf(40, 30), pngOf(20, 10)]));

    expect([...store.objects.keys()]).toEqual([
      "requests/q_000001/q_000002",
      "requests/q_000001/q_000003",
    ]);
    expect(log).toEqual([
      "store requests/q_000001/q_000002",
      "store requests/q_000001/q_000003",
      "save q_000001",
    ]);
    expect(requests.saved[0]?.details).toMatchObject({
      photos: [{ position: 0 }, { position: 1 }],
    });
  });

  it("refuse une quatrième photo : rien rangé, ni au stockage ni en base", async () => {
    const { handler, requests, store } = setup();
    const four = [pngOf(1, 1), pngOf(1, 1), pngOf(1, 1), pngOf(1, 1)];
    await expect(handler.execute(report("o1", four))).rejects.toThrow(TooManyRequestPhotosError);
    expect(requests.saved).toHaveLength(0);
    expect(store.objects.size).toBe(0);
  });

  it("refuse une photo invalide AVANT toute lecture", async () => {
    const { handler, store } = setup();
    await expect(handler.execute(report("o1", [Buffer.from("%PDF-1.7")]))).rejects.toThrow(
      InvalidRequestPhotoError,
    );
    expect(store.objects.size).toBe(0);
  });

  it("hors périmètre (commande d'un autre, ou inconnue) → 404 nommée", async () => {
    const { handler, requests } = setup();
    await expect(handler.execute(report("o_autre"))).rejects.toThrow(ReportedOrderNotFoundError);
    expect(requests.saved).toHaveLength(0);
  });

  it("commande ni retirée ni livrée → 409 qui nomme la commande", async () => {
    const { handler } = setup();
    await expect(handler.execute(report("o2"))).rejects.toThrow(OrderNotYetFulfilledError);
    await expect(handler.execute(report("o2"))).rejects.toThrow(/CMD-0002/u);
  });

  it("refuse un motif « Nous écrire » : l'envoi exige un motif du bon type (§6.5)", async () => {
    const { handler } = setup(reason({ id: "r_damaged", kind: "contact", audience: "both" }));
    await expect(handler.execute(report("o1"))).rejects.toThrow(RequestReasonUnavailableError);
  });

  it("refuse un compte disparu plutôt que d'inventer un auteur", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(report("o1", [], { userId: "u_gone", companyId: null })),
    ).rejects.toThrow(RequestAuthorUnknownError);
  });
});
