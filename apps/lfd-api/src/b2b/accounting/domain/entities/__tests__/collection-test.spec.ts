import { CollectionTest, MAX_COLLECTION_TEST_CENTS } from "../collection-test.js";
import {
  CollectionTestAlreadyRefundedError,
  CollectionTestAlreadyReturnedError,
  CollectionTestAmountOutOfRangeError,
  CollectionTestDayClosedError,
  CollectionTestDayTooEarlyError,
  CollectionTestNothingToRefundError,
  CollectionTestRefundDayInvalidError,
  CollectionTestRemittanceEmptyError,
  CollectionTestSequenceMismatchError,
} from "../../errors/collection-test-errors.js";
import { isAuditCoherent } from "../../services/pain008-audit.js";
import type { TestBankReturn } from "../collection-test.js";
import {
  CREATED_AT,
  DUE_DAY,
  EARLIEST_DAY,
  TEST_ID,
  eligible,
  generateInput,
  generated,
} from "./collection-test-fixtures.js";

/** Après l'échéance : le 6 novembre 2026, 10 h à Paris. */
const AFTER_DUE = new Date("2026-11-06T09:00:00.000Z");

const bankReturn = (overrides: Partial<TestBankReturn> = {}): TestBankReturn => ({
  kind: "reject",
  reasonCode: "AM04",
  reasonLabel: null,
  returnedOn: "2026-11-05",
  amountCents: 100,
  source: "pain002",
  recorded: { at: AFTER_DUE, staffId: "staff_2" },
  ...overrides,
});

describe("générer un prélèvement d'essai", () => {
  it("le plafond est 1 € (Hugo, 2026-10-22)", () => {
    expect(MAX_COLLECTION_TEST_CENTS).toBe(100);
  });

  it("accepte 1 centime et 1,00 €", () => {
    expect(generated({ amountCents: 1 }).amountCents).toBe(1);
    expect(generated({ amountCents: 100 }).amountCents).toBe(100);
  });

  it.each([0, -1, 101, 1_001, 0.5])("refuse %s centimes — 1,01 € compris", (amountCents) => {
    expect(() => generated({ amountCents })).toThrow(CollectionTestAmountOutOfRangeError);
  });

  it("accepte l'échéance la plus proche, J + 2 jours ouvrés (jeudi → lundi)", () => {
    expect(generated({ requestedCollectionDay: EARLIEST_DAY }).toPersistence()).toMatchObject({
      requestedCollectionDay: EARLIEST_DAY,
    });
  });

  it("refuse J + 1 jour ouvré, en nommant la plus proche — la pré-notification n'y est plus", () => {
    expect(() => generated({ requestedCollectionDay: "2026-10-23" })).toThrow(
      CollectionTestDayTooEarlyError,
    );
    expect(() => generated({ requestedCollectionDay: "2026-10-23" })).toThrow(/2026-10-26/u);
  });

  it("refuse un jour fermé de TARGET2 (un samedi), en nommant le suivant", () => {
    expect(() => generated({ requestedCollectionDay: "2026-11-07" })).toThrow(
      CollectionTestDayClosedError,
    );
    expect(() => generated({ requestedCollectionDay: "2026-11-07" })).toThrow(/2026-11-09/u);
  });

  it("OOFF sur un mandat récurrent est refusé ; RCUR et FRST passent", () => {
    expect(() => generated({ sequence: "OOFF" })).toThrow(CollectionTestSequenceMismatchError);
    expect(generated({ sequence: "FRST" }).toPersistence().sequence).toBe("FRST");
  });

  it("RCUR et FRST sur un mandat ponctuel sont refusés ; OOFF passe", () => {
    const verdict = eligible({ paymentType: "one_off" });
    expect(() => generated({ verdict, sequence: "RCUR" })).toThrow(
      CollectionTestSequenceMismatchError,
    );
    expect(() => generated({ verdict, sequence: "FRST" })).toThrow(
      CollectionTestSequenceMismatchError,
    );
    expect(generated({ verdict, sequence: "OOFF" }).toPersistence().sequence).toBe("OOFF");
  });

  it("refuse un libellé que le jeu SEPA vide entièrement", () => {
    expect(() => generated({ remittance: "€€€" })).toThrow(CollectionTestRemittanceEmptyError);
  });

  it("le libellé par défaut est « ESSAI PRELEVEMENT », un libellé donné passe au jeu SEPA", () => {
    expect(generated().toPersistence().remittance).toBe("ESSAI PRELEVEMENT");
    expect(generated({ remittance: "  " }).toPersistence().remittance).toBe("ESSAI PRELEVEMENT");
    expect(generated({ remittance: "Essai n°2 éclair" }).toPersistence().remittance).toBe(
      "Essai n 2 eclair",
    );
  });

  it("le fichier : un débit, la séquence demandée, les références ESS-, le schéma du mandat", () => {
    const state = generated({ sequence: "FRST", amountCents: 37 }).toPersistence();

    expect(state.messageId).toBe(`ESS-${TEST_ID}`);
    expect(state.endToEndId).toBe(`ESS-${TEST_ID}`);
    expect(state.xml).toContain(`<MsgId>ESS-${TEST_ID}</MsgId>`);
    expect(state.xml).toContain(`<PmtInfId>ESS-${TEST_ID}-FRST</PmtInfId>`);
    expect(state.xml).toContain(`<EndToEndId>ESS-${TEST_ID}</EndToEndId>`);
    expect(state.xml).toContain("<SeqTp>FRST</SeqTp>");
    expect(state.xml).toContain("<LclInstrm><Cd>B2B</Cd></LclInstrm>");
    expect(state.xml).toContain(`<ReqdColltnDt>${DUE_DAY}</ReqdColltnDt>`);
    expect(state.xml).toContain('<InstdAmt Ccy="EUR">0.37</InstdAmt>');
    expect(state.xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(state.xml).toContain("<CreDtTm>2026-10-22T10:00:00</CreDtTm>");
    expect(state.xml).not.toContain("BROUILLON");
    expect(isAuditCoherent(state.xml)).toBe(true);
  });

  it("l'entité émettrice est le créancier du mandat", () => {
    expect(generated().toPersistence().legalEntityId).toBe("le_1");
  });

  it("naît « avant l'échéance », sans retour ni remboursement", () => {
    const test = generated();

    expect(test.statusOn("2026-10-22")).toBe("awaiting_due_date");
    expect(test.toPersistence()).toMatchObject({ bankReturn: null, refund: null });
  });
});

describe("« Marqué remboursé » (Q4)", () => {
  it("passe l'essai échu de « à rembourser » à « remboursé »", () => {
    const test = generated();
    expect(test.statusOn("2026-11-06")).toBe("to_refund");

    test.markRefunded("2026-11-06", { at: AFTER_DUE, staffId: "staff_2" });

    expect(test.statusOn("2026-11-06")).toBe("refunded");
    expect(test.toPersistence().refund).toEqual({
      refundedOn: "2026-11-06",
      recorded: { at: AFTER_DUE, staffId: "staff_2" },
    });
  });

  it("refuse un second geste", () => {
    const test = generated();
    test.markRefunded("2026-11-06", { at: AFTER_DUE, staffId: "staff_2" });

    expect(() => test.markRefunded("2026-11-06", { at: AFTER_DUE, staffId: "s" })).toThrow(
      CollectionTestAlreadyRefundedError,
    );
  });

  it("refuse avant l'échéance : rien n'a pu être prélevé", () => {
    expect(() =>
      generated().markRefunded("2026-10-22", { at: CREATED_AT, staffId: "staff_2" }),
    ).toThrow(CollectionTestNothingToRefundError);
  });

  it("refuse quand la banque a rejeté ou retourné le débit", () => {
    const test = generated();
    test.recordBankReturn(bankReturn());

    expect(() => test.markRefunded("2026-11-06", { at: AFTER_DUE, staffId: "s" })).toThrow(
      CollectionTestNothingToRefundError,
    );
    expect(test.statusOn("2026-11-06")).toBe("returned");
  });

  it("refuse un jour futur, ou antérieur à l'échéance", () => {
    const at = { at: AFTER_DUE, staffId: "s" };
    expect(() => generated().markRefunded("2026-11-07", at)).toThrow(
      CollectionTestRefundDayInvalidError,
    );
    expect(() => generated().markRefunded("2026-11-04", at)).toThrow(
      CollectionTestRefundDayInvalidError,
    );
  });
});

describe("le retour bancaire d'un essai", () => {
  it("se rattache une fois ; un second est refusé", () => {
    const test = generated();
    test.recordBankReturn(bankReturn());

    expect(() => test.recordBankReturn(bankReturn())).toThrow(CollectionTestAlreadyReturnedError);
  });

  it("arrivé après « Marqué remboursé », il est gardé et le statut le crie", () => {
    const test = generated();
    test.markRefunded("2026-11-06", { at: AFTER_DUE, staffId: "s" });
    test.recordBankReturn(bankReturn({ kind: "return" }));

    expect(test.statusOn("2026-11-06")).toBe("refunded_and_returned");
  });

  it("se relit tel quel après rehydratation", () => {
    const test = generated();
    test.recordBankReturn(bankReturn());

    const again = CollectionTest.rehydrate(test.toPersistence());

    expect(again.hasBankReturn).toBe(true);
    expect(again.toPersistence()).toEqual(test.toPersistence());
  });
});

describe("l'entrée de génération", () => {
  it("garde le staff et l'instant de la génération", () => {
    expect(generated().toPersistence().created).toEqual(generateInput().created);
  });
});
