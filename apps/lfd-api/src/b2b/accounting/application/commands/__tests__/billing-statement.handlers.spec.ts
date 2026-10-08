import { BatchNotConstitutedError } from "../../../domain/errors/collection-errors.js";
import {
  ENTITY_ID,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import { world } from "./collection-world.js";

/**
 * L'arrêté de facturation, écrit et annulé avec son lot (plan
 * `plan-le-prelevement-suit-la-facture.md`, F3).
 */

async function constituted(w: ReturnType<typeof world>): Promise<string> {
  const [id] = await w.constitute.execute(
    new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
  );
  return id ?? "";
}

describe("l'arrêté de facturation", () => {
  it("écrit UN arrêté par ligne de débit, avec exactement ses bons, et son total = le montant de la ligne", async () => {
    const w = world();
    const port = [order("c_port"), order("c_port")];
    const quai = order("c_quai");
    w.candidates.orders = [...port, quai];
    w.mandates.mandates = [mandate("c_port"), mandate("c_quai")];

    const batchId = await constituted(w);

    const lines = w.batches.saved.get(batchId)?.lines ?? [];
    const statements = w.statements.inserted.map((statement) => statement.toPersistence());
    expect(statements).toHaveLength(lines.length);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const statement = statements.find((state) => state.lineRank === line.rank);
      expect(statement).toMatchObject({
        batchId,
        payerCompanyId: line.debtorCompanyId,
        totalTtcCents: line.amountCents,
        ordersTotalCents: line.ordersTotalCents,
        issuedOn: "2026-10-02",
      });
      expect([...(statement?.orderIds ?? [])].sort()).toEqual([...line.orderIds].sort());
    }
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "billing_statement.issued",
      "billing_statement.issued",
    ]);
  });

  it("écrit l'arrêté APRÈS sa ligne : il la cite par clé étrangère", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];

    const batchId = await constituted(w);

    const log = w.steps.log;
    expect(log.indexOf(`insert:statement:${batchId}`)).toBeGreaterThan(
      log.indexOf("save:batch:constituted"),
    );
  });

  it("annuler le lot annule ses arrêtés, avant d'écrire le lot, et le journalise", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const batchId = await constituted(w);
    const [statement] = w.statements.inserted;

    await w.cancel.execute(new CancelCollectionBatchCommand(batchId, "staff_1"));

    expect(w.statements.cancelledIds).toEqual(new Set([statement?.id]));
    const log = w.steps.log;
    expect(log.indexOf(`cancel:statements:${batchId}`)).toBeLessThan(
      log.indexOf("save:batch:cancelled"),
    );
    expect(w.events.factTypes()).toContain("billing_statement.cancelled");
  });

  it("refuse d'annuler l'arrêté d'un lot déposé : l'arrêté reste actif", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const batchId = await constituted(w);
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    await w.deposit.execute(new DepositCollectionBatchCommand(batchId, "staff_1"));

    await expect(
      w.cancel.execute(new CancelCollectionBatchCommand(batchId, "staff_1")),
    ).rejects.toThrow(BatchNotConstitutedError);
    expect(w.statements.cancelledIds.size).toBe(0);
    await expect(w.statements.cancelForBatch(batchId)).rejects.toThrow(BatchNotConstitutedError);
  });

  it("reconstituer fige de NOUVEAUX arrêtés, sous le nouveau lot", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const first = await constituted(w);
    await w.cancel.execute(new CancelCollectionBatchCommand(first, "staff_1"));
    w.candidates.orders = w.candidates.orders.map((o) => ({
      ...o,
      collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
    }));

    const second = await constituted(w);

    const states = w.statements.inserted.map((statement) => statement.toPersistence());
    expect(states.map((state) => state.batchId)).toEqual([first, second]);
    expect(w.statements.cancelledIds.has(states[1]?.id ?? "")).toBe(false);
  });
});
