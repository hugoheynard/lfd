import { returnableLine } from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import {
  CollectionReturnNotFoundError,
  LineAlreadyReturnedError,
  RefundRequestOnB2bError,
  RepresentationRefusedError,
  ReturnableLineNotFoundError,
} from "../../../domain/errors/collection-return-errors.js";
import { RecordCollectionReturnCommand } from "../record-collection-return.command.js";
import { RepresentCollectionReturnCommand } from "../represent-collection-return.command.js";
import { SettleCollectionReturnCommand } from "../settle-collection-return.command.js";
import { WriteOffCollectionReturnCommand } from "../write-off-collection-return.command.js";
import { returnWorld, statesOf } from "./collection-return-doubles.js";

type World = ReturnType<typeof returnWorld>;

function rejectAm04(kind: "reject" | "refund_request" = "reject"): RecordCollectionReturnCommand {
  const code = kind === "reject" ? "AM04" : "MD06";
  return new RecordCollectionReturnCommand(
    "lot_1",
    1,
    kind,
    code,
    null,
    "2026-10-16",
    750,
    "staff_1",
  );
}

async function recorded(w: World): Promise<string> {
  return w.record.execute(rejectAm04());
}

describe("saisir un retour bancaire (R5a)", () => {
  it("enregistre le retour au montant de la ligne, et TOUTES ses commandes passent returned", async () => {
    const w = returnWorld();

    const id = await recorded(w);

    expect(w.returns.saved.get(id)?.toPersistence()).toMatchObject({
      amountCents: 12_345,
      source: "manual",
      resolution: "pending",
    });
    expect(statesOf(w.orders)).toEqual(["returned", "returned"]);
    expect(w.events.factTypes()).toEqual(["collection.returned"]);
  });

  it("un second retour sur la même ligne est refusé, sans rien changer", async () => {
    const w = returnWorld();
    await recorded(w);

    await expect(recorded(w)).rejects.toThrow(LineAlreadyReturnedError);
    expect(w.returns.saved.size).toBe(1);
  });

  it("une ligne inconnue rend 404", async () => {
    const w = returnWorld();
    const command = new RecordCollectionReturnCommand(
      "lot_x",
      9,
      "reject",
      "AM04",
      null,
      "2026-10-16",
      null,
      "s",
    );

    await expect(w.record.execute(command)).rejects.toThrow(ReturnableLineNotFoundError);
  });

  it("refuse un remboursement sur un lot B2B, et les commandes restent prélevées", async () => {
    const w = returnWorld(returnableLine({ scheme: "B2B" }));

    await expect(w.record.execute(rejectAm04("refund_request"))).rejects.toThrow(
      RefundRequestOnB2bError,
    );
    expect(statesOf(w.orders)).toEqual(["collected", "collected"]);
  });
});

describe("traiter un retour bancaire", () => {
  it("re-présenter : les commandes redeviennent dues et quittent la ligne", async () => {
    const w = returnWorld();
    const id = await recorded(w);

    await w.represent.execute(new RepresentCollectionReturnCommand(id, "staff_2"));

    expect(w.returns.saved.get(id)?.resolution).toBe("represented");
    expect([...w.orders.saved.values()].map((o) => o.toPersistence())).toEqual([
      expect.objectContaining({ state: "due", batchId: null }),
      expect.objectContaining({ state: "due", batchId: null }),
    ]);
    expect(w.events.factTypes()).toEqual(["collection.returned", "collection.return_resolved"]);
  });

  it("re-présenter est refusé sous un mandat révoqué : rien ne bouge", async () => {
    const w = returnWorld();
    const id = await recorded(w);
    w.mandates.now.set("mdt_1", { active: false, iban: null });

    await expect(
      w.represent.execute(new RepresentCollectionReturnCommand(id, "staff_2")),
    ).rejects.toThrow(RepresentationRefusedError);
    expect(statesOf(w.orders)).toEqual(["returned", "returned"]);
    expect(w.returns.saved.get(id)?.resolution).toBe("pending");
  });

  it("re-présenter est refusé sous arrêté et pour un ponctuel consommé", async () => {
    for (const line of [
      returnableLine({ regime: "statement" }),
      returnableLine({ sequence: "OOFF" }),
    ]) {
      const w = returnWorld(line);
      const id = await recorded(w);

      await expect(
        w.represent.execute(new RepresentCollectionReturnCommand(id, "staff_2")),
      ).rejects.toThrow(RepresentationRefusedError);
    }
  });

  it("régler autrement : la note va aux commandes", async () => {
    const w = returnWorld(returnableLine({ regime: "statement" }));
    const id = await recorded(w);

    await w.settle.execute(new SettleCollectionReturnCommand(id, "virement du 20", "staff_2"));

    expect([...w.orders.saved.values()].map((o) => o.toPersistence())).toEqual([
      expect.objectContaining({ state: "settled_otherwise", settledNote: "virement du 20" }),
      expect.objectContaining({ state: "settled_otherwise", settledNote: "virement du 20" }),
    ]);
  });

  it("passer en perte : un état et un fait, la note sur le retour", async () => {
    const w = returnWorld();
    const id = await recorded(w);

    await w.writeOff.execute(new WriteOffCollectionReturnCommand(id, "liquidation", "staff_2"));

    expect(statesOf(w.orders)).toEqual(["written_off", "written_off"]);
    expect(w.returns.saved.get(id)?.toPersistence().resolutionNote).toBe("liquidation");
  });

  it("un retour inconnu rend 404", async () => {
    const w = returnWorld();

    await expect(
      w.writeOff.execute(new WriteOffCollectionReturnCommand("nope", "x", "s")),
    ).rejects.toThrow(CollectionReturnNotFoundError);
  });
});
