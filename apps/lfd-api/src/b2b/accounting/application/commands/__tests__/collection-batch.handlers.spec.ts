import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
  DepositRecheckFailedError,
  NothingToCollectError,
} from "../../../domain/errors/collection-errors.js";
import {
  ENTITY_ID,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { world } from "./collection-world.js";
import { sendAllQueued } from "./notice-doubles.js";

/** Le 1er octobre 2026, 01h00 à Paris : la clôture du cycle constitué, plus une heure. */
const SAME_DAY_AS_CLOSE = new Date("2026-09-30T23:00:00.000Z");

describe("constituer, annuler, déposer un lot", () => {
  it("verrouille l'entité AVANT de lire, puis écrit le lot et ses commandes", async () => {
    const w = world();
    w.candidates.orders = [order("c_port"), order("c_sans_mandat")];
    w.mandates.mandates = [mandate("c_port")];

    const ids = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    expect(w.steps.log.slice(0, 2)).toEqual([`lock:${ENTITY_ID}`, "read:floor"]);
    expect(ids).toHaveLength(1);
    const states = [...w.orders.saved.values()].map((o) => o.toPersistence());
    expect(states.map((s) => s.state).sort()).toEqual(["batched", "excluded"]);
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "billing_statement.issued",
      "collection.notice_queued",
    ]);
    // Q2 : la société sans mandat rend le lot indéposable.
    expect(w.batches.saved.get(ids[0] ?? "")?.depositable).toBe(false);
  });

  /**
   * PA1 : le lot FIGE l'échéance du calendrier, et son XML porte la même.
   * Cycle clos le 1er octobre 2026, délai de 14 j → jeudi 15 octobre. Lot
   * constitué le jour même de la clôture (1er octobre, 01h00 Paris) : D4 ne
   * joue pas.
   */
  it("fige l'échéance du calendrier sur le lot, et le XML porte la même", async () => {
    const w = world();
    w.clock.set(SAME_DAY_AS_CLOSE);
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];

    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    const state = w.batches.saved.get(id ?? "")?.toPersistence();
    expect(state?.requestedCollectionDay).toBe("2026-10-15");
    expect(state?.xml).toContain("<ReqdColltnDt>2026-10-15</ReqdColltnDt>");
  });

  it("annuler rend les commandes `due` ; reconstituer prend un AUTRE lot", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [first] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    await w.cancel.execute(new CancelCollectionBatchCommand(first ?? "", "staff_1"));

    expect([...w.orders.saved.values()].map((o) => o.stateName)).toEqual(["due"]);
    w.candidates.orders = w.candidates.orders.map((o) => ({
      ...o,
      collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
    }));
    const [second] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );
    expect(second).not.toBe(first);
  });

  it("le dépôt relit le mandat : révoqué depuis la constitution, il refuse et nomme", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );
    w.recheck.now = new Map([["m_c_port", { active: false, iban: null }]]);
    sendAllQueued(w.noticeStore, w.clock.now());

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
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    sendAllQueued(w.noticeStore, w.clock.now());

    await w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1"));

    expect(w.orders.saved.get(placed.orderId)?.stateName).toBe("collected");
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "billing_statement.issued",
      "collection.notice_queued",
      "collection.batch_deposited",
    ]);
  });

  it("le dépôt refuse une commande annulée après la constitution", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    w.cancelled.numbers = ["CMD-X"];
    sendAllQueued(w.noticeStore, w.clock.now());

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1")),
    ).rejects.toThrow(/CMD-X a été annulée/u);
  });

  it("refuse sans plancher, et quand il n'y a rien à faire", async () => {
    const w = world();
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR)),
    ).rejects.toThrow(NothingToCollectError);
    w.candidates.floorAt = null;
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR)),
    ).rejects.toThrow(CollectionFloorMissingError);
  });

  /**
   * Régression (2026-10-08) : le plancher posé le jour de la mise en service
   * tombait APRÈS la clôture du cycle constitué, et « Constituer » répondait
   * « aucune commande à prélever » au lieu de dire que le premier cycle
   * prélevable n'était pas encore clos.
   */
  it("plancher après la clôture : dit quand se clôt le premier mois prélevable", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    // 5 octobre, Paris — après la clôture du 1er octobre que constitue AFTER_CLOSE.
    w.candidates.floorAt = new Date("2026-10-05T08:00:00.000Z");

    const refusal = w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    await expect(refusal).rejects.toThrow(CollectionNotYetOpenError);
    await expect(refusal).rejects.toThrow(
      "Le premier mois prélevable se clôt le 1er novembre 2026 : les commandes passées avant le 5 octobre 2026 (mise en service du prélèvement) n'entrent dans aucun lot.",
    );
    expect(w.batches.saved.size).toBe(0);
  });

  it("plancher avant la clôture : la constitution est inchangée", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];

    const ids = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    expect(ids).toHaveLength(1);
  });
});
