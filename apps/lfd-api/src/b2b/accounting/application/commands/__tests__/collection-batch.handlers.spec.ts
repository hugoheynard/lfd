import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import {
  CollectionFloorMissingError,
  DepositRecheckFailedError,
  NothingToCollectError,
} from "../../../domain/errors/collection-errors.js";
import {
  ENTITY_ID,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { world } from "./collection-world.js";

describe("constituer, annuler, déposer un lot", () => {
  it("verrouille l'entité AVANT de lire, puis écrit le lot et ses commandes", async () => {
    const w = world();
    w.candidates.orders = [order("c_port"), order("c_sans_mandat")];
    w.mandates.mandates = [mandate("c_port")];

    const ids = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );

    expect(w.steps.log.slice(0, 2)).toEqual([`lock:${ENTITY_ID}`, "read:floor"]);
    expect(ids).toHaveLength(1);
    const states = [...w.orders.saved.values()].map((o) => o.toPersistence());
    expect(states.map((s) => s.state).sort()).toEqual(["batched", "excluded"]);
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "billing_statement.issued",
    ]);
    // Q2 : la société sans mandat rend le lot indéposable.
    expect(w.batches.saved.get(ids[0] ?? "")?.depositable).toBe(false);
  });

  it("annuler rend les commandes `due` ; reconstituer prend un AUTRE lot", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [first] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );

    await w.cancel.execute(new CancelCollectionBatchCommand(first ?? "", "staff_1"));

    expect([...w.orders.saved.values()].map((o) => o.stateName)).toEqual(["due"]);
    w.candidates.orders = w.candidates.orders.map((o) => ({
      ...o,
      collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
    }));
    const [second] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    expect(second).not.toBe(first);
  });

  it("le dépôt relit le mandat : révoqué depuis la constitution, il refuse et nomme", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: false, iban: null }]]);

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1")),
    ).rejects.toThrow(DepositRecheckFailedError);
  });

  it("le dépôt passe les commandes `collected` quand rien n'a bougé", async () => {
    const w = world();
    const placed = order("c_port");
    w.candidates.orders = [placed];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);

    await w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1"));

    expect(w.orders.saved.get(placed.orderId)?.stateName).toBe("collected");
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "billing_statement.issued",
      "collection.batch_deposited",
    ]);
  });

  it("le dépôt refuse une commande annulée après la constitution", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    w.cancelled.numbers = ["CMD-X"];

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1")),
    ).rejects.toThrow(/CMD-X a été annulée/u);
  });

  it("refuse sans plancher, et quand il n'y a rien à faire", async () => {
    const w = world();
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1")),
    ).rejects.toThrow(NothingToCollectError);
    w.candidates.floorAt = null;
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1")),
    ).rejects.toThrow(CollectionFloorMissingError);
  });
});
