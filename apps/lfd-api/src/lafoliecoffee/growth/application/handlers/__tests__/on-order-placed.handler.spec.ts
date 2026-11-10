import { OrderPlacedEvent } from "../../../../orders/domain/events/order-placed.event.js";
import { CompanyNamer, type CompanyIdentity } from "../../../domain/ports/company-namer.js";
import { OnOrderPlaced } from "../on-order-placed.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { BrokenCustomers, TableCustomers } from "./order-fact-doubles.js";

/** La personne qui commande dans ces cas, sous son nom du moment. */
const customers = (): TableCustomers => new TableCustomers(new Map([["user_7", "Paul Martin"]]));

/** Annuaire doublé : une seule société connue, tout le reste est inconnu. */
class StubCompanies extends CompanyNamer {
  readonly asked: string[] = [];
  nameOf(companyId: string): Promise<CompanyIdentity | null> {
    this.asked.push(companyId);
    return Promise.resolve(
      companyId === "company_3"
        ? { enseigne: "Boulangerie Martin", raisonSociale: "SARL MARTIN" }
        : null,
    );
  }
  /** Cet abonné ne nomme qu'une société à la fois ; le lot ne le concerne pas. */
  namesOf(): Promise<ReadonlyMap<string, CompanyIdentity>> {
    return Promise.resolve(new Map());
  }
}

/**
 * L'abonné mappe `OrderPlacedEvent` → une entrée de journal « lead chaud » avec
 * une clé d'idempotence déterministe par commande.
 */
describe("OnOrderPlaced", () => {
  const work = new BackgroundWork();

  it("journalise order.placed sur le sujet user, clé déterministe et payload", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new OnOrderPlaced(recorder, new StubCompanies(), customers(), work);

    handler.handle(new OrderPlacedEvent("order_9", "ORD-9", "user_7", "company_3", 4200));
    await work.whenIdle();

    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]).toEqual({
      type: "order.placed",
      subjectType: "user",
      subjectId: "user_7",
      idempotencyKey: "order.placed:order_9",
      payload: {
        // La personne, sujet de la ligne, sous son nom DU MOMENT (D6).
        subjectLabel: "Paul Martin",
        orderId: "order_9",
        orderNumber: "ORD-9",
        companyId: "company_3",
        // Le client, FIGÉ : une enseigne change, une commande de 2024 doit
        // continuer de nommer son client comme il s'appelait en 2024.
        clientName: "Boulangerie Martin",
        clientLegalName: "SARL MARTIN",
        totalCents: 4200,
      },
    });
  });

  it("préserve un companyId nul, et n’interroge pas l’annuaire", async () => {
    const recorder = new RecordingActivityRecorder();
    const companies = new StubCompanies();
    new OnOrderPlaced(recorder, companies, customers(), work).handle(
      new OrderPlacedEvent("order_1", "ORD-1", "user_1", null, 400),
    );
    await work.whenIdle();

    expect(recorder.records[0]?.payload).toMatchObject({ companyId: null });
    // Une commande sans société ne paie aucune lecture.
    expect(companies.asked).toEqual([]);
    expect(recorder.records[0]?.payload).not.toHaveProperty("clientName");
  });

  it("n’invente pas de nom quand la société est introuvable", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnOrderPlaced(recorder, new StubCompanies(), customers(), work).handle(
      new OrderPlacedEvent("order_2", "ORD-2", "user_1", "company_inconnue", 400),
    );
    await work.whenIdle();

    expect(recorder.records[0]?.payload).not.toHaveProperty("clientName");
  });

  it("fige le nom de la personne : la renommer ensuite ne change pas la ligne écrite", async () => {
    const recorder = new RecordingActivityRecorder();
    const names = customers();
    new OnOrderPlaced(recorder, new StubCompanies(), names, work).handle(
      new OrderPlacedEvent("order_3", "ORD-3", "user_7", null, 400),
    );
    await work.whenIdle();

    names.renamed("user_7", "Paul Durand");

    expect(recorder.records[0]?.payload).toMatchObject({ subjectLabel: "Paul Martin" });
  });

  it("écrit le fait SANS libellé quand la personne n'a pas de nom — jamais son adresse", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnOrderPlaced(recorder, new StubCompanies(), customers(), work).handle(
      new OrderPlacedEvent("order_4", "ORD-4", "user_sans_nom", null, 400),
    );
    new OnOrderPlaced(recorder, new StubCompanies(), new BrokenCustomers(), work).handle(
      new OrderPlacedEvent("order_5", "ORD-5", "user_7", null, 400),
    );
    await work.whenIdle();

    expect(recorder.records).toHaveLength(2);
    for (const record of recorder.records) {
      expect(record.payload).not.toHaveProperty("subjectLabel");
    }
  });
});
