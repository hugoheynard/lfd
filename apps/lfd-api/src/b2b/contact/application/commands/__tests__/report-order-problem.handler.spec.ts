import { Buffer } from "node:buffer";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
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
import { ORDER_PROBLEM_REPORTED } from "../../../domain/order-problem-reported.fact.js";
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
const FULFILLED: ReportableOrder = {
  id: "o1",
  number: "CMD-0001",
  fulfilled: true,
  companyId: null,
  site: null,
};
const PENDING: ReportableOrder = {
  id: "o2",
  number: "CMD-0002",
  fulfilled: false,
  companyId: null,
  site: null,
};
/** Une commande du site `chalet`, son principal `alpes` COPIÉ à la passation. */
const SITE_ORDER: ReportableOrder = {
  id: "o3",
  number: "CMD-0003",
  fulfilled: true,
  companyId: "chalet",
  site: { companyId: "chalet", name: "Chalet Gentiane", principalCompanyId: "alpes" },
};
/** La même, passée avant la copie du principal (N1) : aucun principal. */
const BEFORE_N1: ReportableOrder = {
  id: "o4",
  number: "CMD-0004",
  fulfilled: true,
  companyId: "chalet",
  site: { companyId: "chalet", name: "Chalet Gentiane", principalCompanyId: null },
};
const JEAN = { name: "Jean Martin", email: "jean@exemple.fr", phone: "" };
const ME: ReportOrderProblemCommand["actor"] = { userId: "u1" };

function setup(...reasons: ReturnType<typeof reason>[]): {
  handler: ReportOrderProblemHandler;
  requests: MemoryRequests;
  store: MemoryPhotoStore;
  events: RecordingPublisher;
  uow: TransactionalUnitOfWork;
  log: string[];
} {
  const log: string[] = [];
  const requests = new MemoryRequests([], log);
  const store = new MemoryPhotoStore(log);
  const events = new RecordingPublisher();
  const uow = new TransactionalUnitOfWork();
  const handler = new ReportOrderProblemHandler(
    new VisibleOrders({ o1: FULFILLED, o2: PENDING, o3: SITE_ORDER, o4: BEFORE_N1 }),
    new MemoryReasons(...(reasons.length === 0 ? [DAMAGED] : reasons)),
    new Authors({ u1: JEAN }),
    new FixedAudiences(),
    requests,
    store,
    new FixedIdGenerator("q"),
    new FixedClock(AT),
    events,
    new TransactionalDurablePublisher(uow),
    uow,
  );
  return { handler, requests, store, events, uow, log };
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
    await expect(handler.execute(report("o1", [], { userId: "u_gone" }))).rejects.toThrow(
      RequestAuthorUnknownError,
    );
  });

  it("une commande personnelle n'écrit aucun fait « problème signalé »", async () => {
    const { handler, uow } = setup();
    await handler.execute(report("o1"));
    expect(uow.of(ORDER_PROBLEM_REPORTED)).toEqual([]);
  });
});

describe("ReportOrderProblemHandler — le fait durable pour le principal (N4a)", () => {
  const SITE_ACTOR = { userId: "u1" };

  /**
   * Lot C1 de `plan-commandes-des-sites.md` (§7.3, 2026-10-21) : la demande
   * s'écrivait au nom de l'ESPACE DE TRAVAIL ; un membre du principal qui
   * signale sur la commande d'un site l'aurait rangée chez le principal.
   */
  it("la demande est écrite au nom de la société DE LA COMMANDE, pas de l'espace de travail", async () => {
    const { handler, requests } = setup();
    await handler.execute(report("o3", [], SITE_ACTOR));
    expect(requests.saved[0]?.toPersistence()).toMatchObject({ companyId: "chalet" });
  });

  it("écrit `order.problem_reported` avec le principal COPIÉ, le site et l'auteur — sans motif ni message", async () => {
    const { handler, uow } = setup();
    const id = await handler.execute(report("o3", [], SITE_ACTOR));

    const [fact] = uow.of(ORDER_PROBLEM_REPORTED);
    expect(fact).toEqual({
      type: ORDER_PROBLEM_REPORTED,
      key: `${ORDER_PROBLEM_REPORTED}:${id}`,
      payload: {
        requestId: id,
        orderId: "o3",
        orderNumber: "CMD-0003",
        siteCompanyId: "chalet",
        siteName: "Chalet Gentiane",
        principalCompanyId: "alpes",
        authorUserId: "u1",
      },
    });
    expect(JSON.stringify(fact?.payload)).not.toContain("écrasé");
  });

  it("une commande d'avant la copie du principal : le fait part, principal nul (personne ne sera prévenu)", async () => {
    const { handler, uow } = setup();
    await handler.execute(report("o4", [], SITE_ACTOR));
    expect(uow.of(ORDER_PROBLEM_REPORTED)[0]?.payload).toMatchObject({
      principalCompanyId: null,
    });
  });

  it("une demande refusée n'écrit aucun fait", async () => {
    const { handler, uow } = setup(reason({ id: "r_damaged", kind: "contact", audience: "both" }));
    await expect(handler.execute(report("o3", [], SITE_ACTOR))).rejects.toThrow(
      RequestReasonUnavailableError,
    );
    expect(uow.committed).toEqual([]);
  });

  it("la demande et le fait partent dans la MÊME unité de travail", async () => {
    const { handler, requests, uow } = setup();
    const opened: boolean[] = [];
    const save = requests.save.bind(requests);
    requests.save = (request) => {
      opened.push(uow.isOpen);
      return save(request);
    };
    await handler.execute(report("o3", [], SITE_ACTOR));
    expect(opened).toEqual([true]);
    expect(uow.of(ORDER_PROBLEM_REPORTED)).toHaveLength(1);
  });
});
