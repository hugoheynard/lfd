import { OrderPlacedEvent } from "../../../../orders/domain/events/order-placed.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { CompanyNamer, type CompanyIdentity } from "../../../domain/ports/company-namer.js";
import { OnOrderPlaced } from "../on-order-placed.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

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
}

/**
 * L'abonné mappe `OrderPlacedEvent` → une entrée de journal « lead chaud » avec
 * une clé d'idempotence déterministe par commande.
 */
describe("OnOrderPlaced", () => {
  const work = new BackgroundWork();

  it("journalise order.placed sur le sujet user, clé déterministe et payload", async () => {
    const recorder = new RecordingRecorder();
    const handler = new OnOrderPlaced(recorder, new StubCompanies(), work);

    handler.handle(new OrderPlacedEvent("order_9", "ORD-9", "user_7", "company_3", 4200));
    await work.whenIdle();

    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]).toEqual({
      type: "order.placed",
      subjectType: "user",
      subjectId: "user_7",
      idempotencyKey: "order.placed:order_9",
      payload: {
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
    const recorder = new RecordingRecorder();
    const companies = new StubCompanies();
    new OnOrderPlaced(recorder, companies, work).handle(
      new OrderPlacedEvent("order_1", "ORD-1", "user_1", null, 400),
    );
    await work.whenIdle();

    expect(recorder.records[0]?.payload).toMatchObject({ companyId: null });
    // Une commande sans société ne paie aucune lecture.
    expect(companies.asked).toEqual([]);
    expect(recorder.records[0]?.payload).not.toHaveProperty("clientName");
  });

  it("n’invente pas de nom quand la société est introuvable", async () => {
    const recorder = new RecordingRecorder();
    new OnOrderPlaced(recorder, new StubCompanies(), work).handle(
      new OrderPlacedEvent("order_2", "ORD-2", "user_1", "company_inconnue", 400),
    );
    await work.whenIdle();

    expect(recorder.records[0]?.payload).not.toHaveProperty("clientName");
  });
});
