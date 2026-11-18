import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import {
  OrderBudgetCommitmentCorrectedEvent,
  OrderBudgetCommitmentCorrectedPayloadError,
} from "../../../../orders/domain/events/order-budget-commitment-corrected.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderBudgetCommitmentCorrected } from "../on-order-budget-commitment-corrected.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.budget_commitment_corrected` au journal (E3′). La charge écrite est
 * passée au catalogue des faits : une clé que le contrat refuse serait une
 * ligne illisible pour le back-office.
 */
function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnOrderBudgetCommitmentCorrected(
    recorder,
    new TableCustomers(new Map([["user_7", "Caserne des Alpes"]])),
    new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
  );
  return { recorder, run };
}

const EVENT = new OrderBudgetCommitmentCorrectedEvent(
  "bc_1",
  "order_9",
  "ORD-9",
  "user_7",
  "fiche_1",
  null,
  { number: "1300012345", serviceCode: "SERV-RH" },
);

function delivery(payload: Readonly<Record<string, unknown>>): DurableDelivery {
  return { eventId: "evt_1", type: "order.budget_commitment_corrected", payload };
}

describe("OnOrderBudgetCommitmentCorrected", () => {
  it("cite la fiche qui a corrigé, l'avant et l'après, sous le client", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(EVENT.durableFact().payload));

    const record = recorder.records[0];
    expect(record?.idempotencyKey).toBe("order.budget_commitment_corrected:order_9:bc_1");
    expect(record?.subjectId).toBe("user_7");
    expect(record?.payload).toMatchObject({
      subjectLabel: "Caserne des Alpes",
      orderNumber: "ORD-9",
      correctedBy: { id: "fiche_1", name: "Marie Fournier" },
      before: null,
      after: { number: "1300012345", serviceCode: "SERV-RH" },
    });
    expect(
      JOURNAL_FACTS["order.budget_commitment_corrected"].payload.safeParse(record?.payload).success,
    ).toBe(true);
  });

  it("deux corrections de la même commande, deux témoins", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(EVENT.durableFact().payload));
    await run.handle(delivery({ ...EVENT.durableFact().payload, correctionId: "bc_2" }));

    expect(recorder.records).toHaveLength(2);
  });

  it("une charge illisible n'écrit rien et le dit", async () => {
    const { recorder, run } = handler();

    await expect(
      run.handle(delivery({ ...EVENT.durableFact().payload, after: { number: 42 } })),
    ).rejects.toThrow(OrderBudgetCommitmentCorrectedPayloadError);
    expect(recorder.records).toEqual([]);
  });
});
