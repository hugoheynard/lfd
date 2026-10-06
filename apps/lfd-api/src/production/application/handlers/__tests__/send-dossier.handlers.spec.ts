import { instantToLocal } from "@lfd/contracts";

import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRetakenEvent } from "../../../domain/events/production-day-retaken.event.js";
import type { StoredDossierRecipient } from "../../../domain/ports/dossier-recipients.reader.js";
import { frenchDayLabel } from "../../../domain/services/auto-close-round.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { Directory, RecipientsRows, staffCard } from "../../__tests__/dossier-recipient-doubles.js";
import {
  Bell,
  DispatchTable,
  NoAdminOrigin,
  OneDay,
  RecordingMailer,
  Shelves,
} from "../../__tests__/dossier-dispatch-doubles.js";
import { InMemoryProductionStore } from "../../__tests__/quality-doubles.js";
import { DossierDispatch } from "../../services/dossier-dispatch.service.js";
import { PlanArrestBell } from "../../services/plan-arrest-bell.js";
import { ProductionPapers } from "../../services/production-paper.service.js";
import { SendDossierOnDayClosed } from "../send-dossier-on-day-closed.handler.js";
import { SendDossierOnDayRetaken } from "../send-dossier-on-day-retaken.handler.js";

/**
 * **L'envoi du dossier du jour** (plan `dossier-prod-du-jour.md`, E3), par
 * ses deux abonnés durables. Le jour est dérivé de maintenant ; les instants
 * de clôture et de retirage ne sont que recopiés, jamais comparés à l'horloge.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const CLOSED = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const RETAKEN = new Date(NOW.getTime() - 60 * 60 * 1000);

const PAUL: StoredDossierRecipient = { id: "r-paul", kind: "staff", staffUserId: "s-paul" };
const JEANNE: StoredDossierRecipient = {
  id: "r-jeanne",
  kind: "external",
  email: "jeanne@imprimerie.fr",
  firstName: "Jeanne",
  lastName: "Roux",
  jobTitle: null,
};

function order(orderId: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 12)], CLOSED);
  return day;
}

function setup(rows: readonly StoredDossierRecipient[], day: ProductionDay = closedDay()) {
  const mailer = new RecordingMailer();
  const log = new DispatchTable();
  const bell = new Bell();
  const events = new RecordingPublisher();
  const dispatch = new DossierDispatch(
    new RecipientsRows(rows),
    new Directory().put(staffCard()),
    new ProductionPapers(new InMemoryProductionStore(), new NoAdminOrigin(), new Shelves()),
    log,
    mailer,
    new PlanArrestBell(bell),
    events,
    new FixedClock(NOW),
  );
  const days = new OneDay(day);
  return {
    mailer,
    log,
    bell,
    events,
    day,
    closed: new SendDossierOnDayClosed(days, dispatch),
    retaken: new SendDossierOnDayRetaken(days, dispatch),
  };
}

function closure(reannouncedAt: Date | null = null) {
  const fact = new ProductionDayClosedEvent(DAY, CLOSED, ["ord_1"], reannouncedAt).durableFact();
  return { eventId: "evt-1", type: fact.type, payload: fact.payload };
}

function retake(at: Date = RETAKEN) {
  const fact = new ProductionDayRetakenEvent(DAY, at, 1).durableFact();
  return { eventId: "evt-2", type: fact.type, payload: fact.payload };
}

describe("l'envoi du dossier à l'arrêt", () => {
  it("n'envoie rien, ne journalise rien, quand la liste est vide", async () => {
    const { closed, mailer, events, log } = setup([]);
    await closed.handle(closure());
    expect(mailer.sent).toEqual([]);
    expect(events.traced).toEqual([]);
    expect(log.rows.size).toBe(0);
  });

  it("écrit à chaque destinataire, PDF joint, sous l'objet du jour, et le journalise", async () => {
    const { closed, mailer, events } = setup([PAUL, JEANNE]);
    await closed.handle(closure());

    expect(mailer.sent.map((mail) => mail.to)).toEqual(["paul@fournil.fr", "jeanne@imprimerie.fr"]);
    const [first] = mailer.sent;
    expect(first?.template).toBe("staff.production-dossier");
    expect(first?.data).toMatchObject({
      firstName: "Paul",
      dayLabel: frenchDayLabel(DAY),
      orderCount: 1,
      pieceCount: 12,
      completed: false,
      fileName: `dossier-du-jour-${DAY}.pdf`,
    });
    expect(first?.idempotencyKey).toBe(`production-dossier:${DAY}:${CLOSED.toISOString()}:r-paul`);
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { subjectLabel: DAY, serviceDay: DAY, sent: 2, failed: 0, completed: false },
    ]);
  });

  it("un refus n'arrête pas les autres : noté, nommé dans UNE alerte, jamais retenté", async () => {
    const { closed, mailer, log, bell, events } = setup([PAUL, JEANNE]);
    mailer.refused.add("paul@fournil.fr");

    await closed.handle(closure());

    expect(mailer.sent.map((mail) => mail.to)).toEqual(["jeanne@imprimerie.fr"]);
    expect(log.rows.get(`${DAY}|${CLOSED.toISOString()}|r-paul`)?.outcome).toEqual({
      kind: "failed",
      failure: "adresse refusée par le fournisseur",
    });
    expect(bell.notices).toHaveLength(1);
    expect(bell.notices[0]).toMatchObject({
      kind: "production.dossier_not_sent",
      audience: "production_count_stop:write",
      idempotencyKey: `notification:production.dossier_not_sent:${DAY}:${CLOSED.toISOString()}`,
    });
    expect(bell.notices[0]?.subject).toContain("Paul Martin");
    expect(events.traced.map((event) => event.journalFact().payload)).toMatchObject([
      { sent: 1, failed: 1 },
    ]);

    // La redélivrance ne retente pas Paul, ne renvoie pas à Jeanne.
    mailer.refused.clear();
    await closed.handle(closure());
    expect(mailer.sent).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("une redélivrance du même fait ne renvoie rien", async () => {
    const { closed, mailer } = setup([PAUL, JEANNE]);
    await closed.handle(closure());
    await closed.handle(closure());
    expect(mailer.sent).toHaveLength(2);
  });

  it("ignore une réannonce : le dossier est déjà parti à l'arrêt", async () => {
    const { closed, mailer } = setup([PAUL]);
    await closed.handle(closure(NOW));
    expect(mailer.sent).toEqual([]);
  });

  it("ignore l'arrêt d'une journée reprise depuis : le retirage enverra le dossier complété", async () => {
    const day = closedDay();
    day.retake([order("ord_1", 12), order("ord_2", 4)], RETAKEN, "staff-1");
    const { closed, mailer } = setup([PAUL], day);
    await closed.handle(closure());
    expect(mailer.sent).toEqual([]);
  });
});

describe("l'envoi du dossier complété, au retirage", () => {
  it("renvoie à chacun, « complété », avec les commandes absorbées", async () => {
    const day = closedDay();
    day.retake([order("ord_1", 12), order("ord_2", 4)], RETAKEN, "staff-1");
    const { retaken, mailer, events } = setup([PAUL, JEANNE], day);

    await retaken.handle(retake());

    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0]?.data).toMatchObject({ completed: true, orderCount: 2, pieceCount: 16 });
    expect(mailer.sent[0]?.idempotencyKey).toBe(
      `production-dossier:${DAY}:${RETAKEN.toISOString()}:r-paul`,
    );
    expect(events.traced.map((event) => event.journalFact().payload)).toMatchObject([
      { sent: 2, completed: true },
    ]);
  });

  it("ignore un retirage dépassé par un plus récent", async () => {
    const day = closedDay();
    day.retake([order("ord_1", 12), order("ord_2", 4)], RETAKEN, "staff-1");
    const { retaken, mailer } = setup([PAUL], day);
    await retaken.handle(retake(CLOSED));
    expect(mailer.sent).toEqual([]);
  });
});
