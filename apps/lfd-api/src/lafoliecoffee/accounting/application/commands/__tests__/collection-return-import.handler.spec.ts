import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  RECORDED_AT,
  returnableLine,
} from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import { TEST_ID, generated } from "../../../domain/entities/__tests__/collection-test-fixtures.js";
import { ImportEntryNotRecordableError } from "../../../domain/errors/bank-return-file-errors.js";
import { camt054, pain002 } from "../../../domain/services/__tests__/bank-return-file-fixtures.js";
import { PreviewCollectionReturnImportQuery } from "../../queries/collection-return-queries.js";
import { PreviewCollectionReturnImportHandler } from "../../queries/preview-collection-return-import.handler.js";
import { ConfirmCollectionReturnImportCommand } from "../confirm-collection-return-import.command.js";
import { returnWorld, statesOf } from "./collection-return-doubles.js";
import { MemoryTestReturnTargets } from "./collection-test-doubles.js";

const FILE = pain002("2026-10-16", [
  { endToEndId: "E2E-LOT1-1", amount: "123.45", code: "MS02" },
  { endToEndId: "E2E-INCONNU", amount: "10.00", code: "AM04" },
]);

describe("confirmer un import de retours (R5b)", () => {
  it("enregistre la transaction appariée, source pain002, et ses commandes passent returned", async () => {
    const w = returnWorld();

    const { recordedIds: ids } = await w.confirm.execute(
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

  it("rend le compte rendu : lues, enregistrées, introuvables avec leur RUM et leur montant", async () => {
    const w = returnWorld();
    const file = pain002("2026-10-16", [
      { endToEndId: "E2E-LOT1-1", amount: "123.45", code: "MS02" },
      { endToEndId: "E2E-INCONNU", amount: "10.00", code: "AM04", mandate: "RUM-PERDUE" },
    ]);

    const { report } = await w.confirm.execute(
      new ConfirmCollectionReturnImportCommand(file, ["E2E-LOT1-1"], "staff_1"),
    );

    expect(report).toEqual({
      format: "pain002",
      readCount: 2,
      recordedCount: 1,
      alreadyRecordedCount: 0,
      notFound: [
        {
          endToEndId: "E2E-INCONNU",
          mandateReference: "RUM-PERDUE",
          amountCents: 1_000,
          returnedOn: "2026-10-16",
        },
      ],
      setAside: [],
    });
  });

  it("une référence absente du fichier refuse", async () => {
    const w = returnWorld();

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(FILE, ["AILLEURS"], "s")),
    ).rejects.toThrow(/pas dans ce fichier/u);
  });
});

describe("un retour sur un prélèvement d'essai (ESS-, plan `plan-prelevement-d-essai.md`)", () => {
  const ESSAI = `ESS-${TEST_ID}`;
  const MIXED = pain002("2026-11-05", [
    { endToEndId: ESSAI, amount: "1.00", code: "AM04" },
    { endToEndId: "E2E-LOT1-1", amount: "123.45", code: "MS02" },
  ]);

  function withTest() {
    const w = returnWorld();
    const test = generated();
    w.tests.saved.set(test.id, test);
    return { w, test };
  }

  it("l'aperçu le rattache à son essai au lieu de le dire « inconnu »", async () => {
    const { w } = withTest();
    const preview = new PreviewCollectionReturnImportHandler(
      w.lines,
      new MemoryTestReturnTargets(w.tests),
      new FixedClock(RECORDED_AT),
    );

    const view = await preview.execute(new PreviewCollectionReturnImportQuery(MIXED));

    expect(view.entries[0]).toMatchObject({
      endToEndId: ESSAI,
      status: "collection_test",
      debtorName: "Folie Douce Val",
      lineAmountCents: 100,
      batchLabel: `Essai ${ESSAI}`,
      problem: null,
    });
    expect(view.entries[1]).toMatchObject({ status: "matched" });
  });

  it("la confirmation le pose sur l'essai, et ne touche ni lot, ni ligne, ni commande", async () => {
    const { w, test } = withTest();

    const { recordedIds: ids } = await w.confirm.execute(
      new ConfirmCollectionReturnImportCommand(MIXED, [ESSAI], "staff_1"),
    );

    expect(ids).toEqual([test.id]);
    expect(w.tests.saved.get(test.id)?.toPersistence().bankReturn).toMatchObject({
      kind: "reject",
      reasonCode: "AM04",
      amountCents: 100,
      source: "pain002",
    });
    expect(w.returns.saved.size).toBe(0);
    expect(statesOf(w.orders)).toEqual(["collected", "collected"]);
    expect(w.events.traced.map((event) => event.journalFact().type)).toEqual([
      "collection.test_returned",
    ]);
  });

  it("une référence ESS- qu'aucun essai ne porte refuse, sans chercher parmi les lots", async () => {
    const w = returnWorld();
    const file = pain002("2026-11-05", [{ endToEndId: ESSAI, amount: "1.00" }]);

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(file, [ESSAI], "s")),
    ).rejects.toThrow(/aucun prélèvement d'essai/u);
  });

  it("un second retour sur le même essai est « déjà enregistré »", async () => {
    const { w } = withTest();
    await w.confirm.execute(new ConfirmCollectionReturnImportCommand(MIXED, [ESSAI], "s"));

    await expect(
      w.confirm.execute(new ConfirmCollectionReturnImportCommand(MIXED, [ESSAI], "s")),
    ).rejects.toThrow(/déjà rattaché/u);
  });
});
