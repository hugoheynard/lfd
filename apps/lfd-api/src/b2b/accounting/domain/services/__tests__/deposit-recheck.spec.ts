import type { CollectionBatchLine } from "../../entities/collection-batch-line.js";
import { Iban } from "../../value-objects/iban.js";
import { Rum } from "../../value-objects/rum.js";
import { depositRecheckProblems } from "../deposit-recheck.js";

const FROZEN_IBAN = "FR7630004000031234567890143";
const OTHER_IBAN = "FR1420041010050500013M02606";

const LINE: CollectionBatchLine = {
  rank: 1,
  endToEndId: "E2E-1",
  mandateId: "m1",
  mandateReference: Rum.create("RUM-1"),
  mandateSignedAt: new Date("2026-08-01T10:00:00.000Z"),
  debtorCompanyId: "c1",
  debtorName: "Port",
  debtorIban: Iban.create(FROZEN_IBAN),
  debtorBic: null,
  sequence: "RCUR",
  amountCents: 1200,
  ordersTotalCents: 1200,
  orderIds: ["o1"],
  invoices: [],
  priorOrderCount: 0,
};

describe("depositRecheckProblems — ce qui a changé depuis la constitution", () => {
  it("rien n'a bougé : aucun problème", () => {
    const now = new Map([["m1", { active: true, iban: FROZEN_IBAN }]]);
    expect(depositRecheckProblems([LINE], now, [])).toEqual([]);
  });

  it("mandat révoqué : nommé par sa RUM et son débiteur", () => {
    const now = new Map([["m1", { active: false, iban: FROZEN_IBAN }]]);
    expect(depositRecheckProblems([LINE], now, [])).toEqual([
      "le mandat RUM-1 de Port n'est plus actif",
    ]);
  });

  it("mandat disparu : traité comme révoqué", () => {
    expect(depositRecheckProblems([LINE], new Map(), [])).toEqual([
      "le mandat RUM-1 de Port n'est plus actif",
    ]);
  });

  it("mandat actif sur un autre IBAN : le compte a changé", () => {
    const now = new Map([["m1", { active: true, iban: OTHER_IBAN }]]);
    expect(depositRecheckProblems([LINE], now, [])).toEqual([
      "le compte de Port a changé depuis la constitution",
    ]);
  });

  it("mandat actif sans compte recopié : le compte a changé", () => {
    const now = new Map([["m1", { active: true, iban: null }]]);
    expect(depositRecheckProblems([LINE], now, [])).toEqual([
      "le compte de Port a changé depuis la constitution",
    ]);
  });

  it("une commande annulée s'ajoute après les mandats", () => {
    const now = new Map([["m1", { active: false, iban: null }]]);
    expect(depositRecheckProblems([LINE], now, ["CMD-7"])).toEqual([
      "le mandat RUM-1 de Port n'est plus actif",
      "la commande CMD-7 a été annulée",
    ]);
  });
});
