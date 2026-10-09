import {
  CollectionReturnAlreadyResolvedError,
  InvalidBankReturnReasonError,
  InvalidCollectionReturnError,
  LineAlreadyReturnedError,
  RefundRequestOnB2bError,
  RepresentationRefusedError,
  ReturnAmountMismatchError,
  ReturnOnUndepositedBatchError,
} from "../../errors/collection-return-errors.js";
import { CollectionReturn } from "../collection-return.js";
import { RECORDED_AT, rejectInput, returnableLine } from "./collection-return-fixtures.js";

const STAMP = { at: RECORDED_AT, staffId: "staff_2" };

function recorded(): CollectionReturn {
  return CollectionReturn.record(rejectInput(), returnableLine(), false);
}

describe("le retour bancaire d'une ligne de lot", () => {
  it("s'enregistre à traiter, au montant de la ligne, frais à part", () => {
    expect(recorded().toPersistence()).toMatchObject({
      endToEndId: "E2E-LOT1-1",
      kind: "reject",
      reasonCode: "AM04",
      amountCents: 12_345,
      feeCents: 750,
      resolution: "pending",
      resolved: null,
    });
  });

  it("refuse une ligne d'un lot non déposé", () => {
    const line = returnableLine({ batchStatus: "constituted" });

    expect(() => CollectionReturn.record(rejectInput(), line, false)).toThrow(
      ReturnOnUndepositedBatchError,
    );
  });

  it("refuse un second retour sur la même ligne", () => {
    expect(() => CollectionReturn.record(rejectInput(), returnableLine(), true)).toThrow(
      LineAlreadyReturnedError,
    );
  });

  it("refuse un montant qui n'est pas celui de la ligne — un retour porte sur toute la ligne", () => {
    expect(() =>
      CollectionReturn.record(rejectInput({ amountCents: 12_000 }), returnableLine(), false),
    ).toThrow(ReturnAmountMismatchError);
  });

  it("refuse un remboursement demandé sur un lot interentreprises", () => {
    const input = rejectInput({ kind: "refund_request", reasonCode: "MD06" });

    expect(() => CollectionReturn.record(input, returnableLine({ scheme: "B2B" }), false)).toThrow(
      RefundRequestOnB2bError,
    );
  });

  it("admet le remboursement demandé en CORE", () => {
    const input = rejectInput({ kind: "refund_request", reasonCode: "MD06" });

    expect(CollectionReturn.record(input, returnableLine(), false).toPersistence().kind).toBe(
      "refund_request",
    );
  });

  it("refuse un motif hors liste, et « autre » sans libellé", () => {
    expect(() =>
      CollectionReturn.record(rejectInput({ reasonCode: "ZZ99" }), returnableLine(), false),
    ).toThrow(InvalidBankReturnReasonError);
    expect(() =>
      CollectionReturn.record(rejectInput({ reasonCode: "NARR" }), returnableLine(), false),
    ).toThrow(InvalidBankReturnReasonError);
  });

  it("refuse MD06 pour un rejet : un remboursement ne se demande qu'après règlement", () => {
    expect(() =>
      CollectionReturn.record(rejectInput({ reasonCode: "MD06" }), returnableLine(), false),
    ).toThrow(InvalidBankReturnReasonError);
  });

  it("refuse une date qui n'est pas un jour, et des frais négatifs", () => {
    expect(() =>
      CollectionReturn.record(rejectInput({ returnedOn: "2026-02-30" }), returnableLine(), false),
    ).toThrow(InvalidCollectionReturnError);
    expect(() =>
      CollectionReturn.record(rejectInput({ feeCents: -1 }), returnableLine(), false),
    ).toThrow(InvalidCollectionReturnError);
  });

  it("se re-présente sur une ligne de factures, sous un mandat actif et récurrent", () => {
    const bankReturn = recorded();

    bankReturn.represent(STAMP, returnableLine(), true);

    expect(bankReturn.toPersistence()).toMatchObject({
      resolution: "represented",
      resolved: STAMP,
      resolutionNote: null,
    });
  });

  it.each([
    ["une ligne d'arrêté", returnableLine({ regime: "statement" }), true, "statement_line"],
    ["une ligne d'avant l'arrêté", returnableLine({ regime: "legacy" }), true, "legacy_line"],
    ["un mandat ponctuel consommé", returnableLine({ sequence: "OOFF" }), true, "one_off_consumed"],
    ["un mandat qui n'est plus actif", returnableLine(), false, "mandate_not_active"],
  ] as const)("refuse de re-présenter %s", (_, line, active, refusal) => {
    const bankReturn = recorded();

    expect(() => bankReturn.represent(STAMP, line, active)).toThrow(RepresentationRefusedError);
    try {
      bankReturn.represent(STAMP, line, active);
    } catch (error) {
      expect(error).toMatchObject({ refusal });
    }
    expect(bankReturn.resolution).toBe("pending");
  });

  it("se règle autrement, ou se perd, avec une note — et une seule fois", () => {
    const settled = recorded();
    settled.settleOtherwise("  lien de paiement réglé ", STAMP);
    const lost = recorded();
    lost.writeOff("société liquidée", STAMP);

    expect(settled.toPersistence()).toMatchObject({
      resolution: "settled_otherwise",
      resolutionNote: "lien de paiement réglé",
    });
    expect(lost.toPersistence().resolution).toBe("written_off");
    expect(() => settled.writeOff("encore", STAMP)).toThrow(CollectionReturnAlreadyResolvedError);
    expect(() => recorded().writeOff("  ", STAMP)).toThrow(InvalidCollectionReturnError);
  });
});
