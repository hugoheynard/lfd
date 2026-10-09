import { returnableLine } from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import { ImportEntryNotRecordableError } from "../../../domain/errors/bank-return-file-errors.js";
import { camt054, pain002 } from "../../../domain/services/__tests__/bank-return-file-fixtures.js";
import { ConfirmCollectionReturnImportCommand } from "../confirm-collection-return-import.command.js";
import { returnWorld, statesOf } from "./collection-return-doubles.js";

const FILE = pain002("2026-10-16", [
  { endToEndId: "E2E-LOT1-1", amount: "123.45", code: "MS02" },
  { endToEndId: "E2E-INCONNU", amount: "10.00", code: "AM04" },
]);

describe("confirmer un import de retours (R5b)", () => {
  it("enregistre la transaction appariée, source pain002, et ses commandes passent returned", async () => {
    const w = returnWorld();

    const ids = await w.confirm.execute(
      new ConfirmCollectionReturnImportCommand(FILE, ["E2E-LOT1-1"], "staff_1"),
    );

    expect(ids).toHaveLength(1);
    expect(w.returns.saved.get(ids[0] ?? "")?.toPersistence()).toMatchObject({
      source: "pain002",
      reasonCode: "MS02",
      kind: "reject",
    });
    expect(statesOf(w.orders)).toEqual(["returned", "returned"]);
  });

  it("une transaction retenue qui ne s'apparie pas refuse tout", async () => {
    const w = returnWorld();

    await expect(
      w.confirm.execute(
        new ConfirmCollectionReturnImportCommand(FILE, ["E2E-LOT1-1", "E2E-INCONNU"], "s"),
      ),
    ).rejects.toThrow(ImportEntryNotRecordableError);
  });

  it("un montant différent refuse, en nommant la transaction", async () => {
    const w = returnWorld();
    const file = camt054("2026-10-20", [{ endToEndId: "E2E-LOT1-1", amount: "100.00" }]);

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(file, ["E2E-LOT1-1"], "s")),
    ).rejects.toThrow(/E2E-LOT1-1/u);
  });

  it("un remboursement (MD06) sur une ligne B2B est refusé par la règle de l'agrégat", async () => {
    const w = returnWorld(returnableLine({ scheme: "B2B" }));
    const file = camt054("2026-10-20", [
      { endToEndId: "E2E-LOT1-1", amount: "123.45", code: "MD06" },
    ]);

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(file, ["E2E-LOT1-1"], "s")),
    ).rejects.toThrow(/interentreprises/u);
  });

  it("une référence absente du fichier refuse", async () => {
    const w = returnWorld();

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(FILE, ["AILLEURS"], "s")),
    ).rejects.toThrow(/pas dans ce fichier/u);
  });
});
