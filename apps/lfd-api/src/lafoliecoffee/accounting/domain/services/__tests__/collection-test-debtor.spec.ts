import {
  CollectionTestAmbiguousMandateError,
  CollectionTestDebtorInactiveError,
  CollectionTestNoMandateError,
  CollectionTestOneOffUsedError,
  CollectionTestSequenceMismatchError,
  NotOwnEstablishmentError,
} from "../../errors/collection-test-errors.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import {
  admittedSequence,
  judgeTestDebtor,
  type TestDebtorFacts,
  type TestDebtorVerdict,
} from "../collection-test-debtor.js";
import { mandate } from "./collection-fixtures.js";

const COMPANY = "c_nous";

function facts(overrides: Partial<TestDebtorFacts> = {}): TestDebtorFacts {
  return {
    companyName: "Folie Douce Val",
    companyStatus: "active",
    declared: true,
    mandates: [mandate(COMPANY)],
    batchedMandateIds: new Set(),
    ...overrides,
  };
}

function refusalOf(verdict: TestDebtorVerdict): unknown {
  return verdict.kind === "refused" ? verdict.refusal : null;
}

function eligible(verdict: TestDebtorVerdict): Extract<TestDebtorVerdict, { kind: "eligible" }> {
  if (verdict.kind !== "eligible") {
    throw verdict.refusal;
  }
  return verdict;
}

describe("peut-on faire un essai sur cette société ?", () => {
  it("une société non déclarée à nous est refusée, en la nommant", () => {
    const refusal = refusalOf(judgeTestDebtor(facts({ declared: false })));

    expect(refusal).toBeInstanceOf(NotOwnEstablishmentError);
    expect(String(refusal)).toContain("Folie Douce Val");
  });

  it.each(["pending", "suspended", "terminated"])("une société %s est refusée", (status) => {
    expect(refusalOf(judgeTestDebtor(facts({ companyStatus: status })))).toBeInstanceOf(
      CollectionTestDebtorInactiveError,
    );
  });

  it("sans mandat actif, refus", () => {
    expect(refusalOf(judgeTestDebtor(facts({ mandates: [] })))).toBeInstanceOf(
      CollectionTestNoMandateError,
    );
  });

  it("un mandat repris d'un autre créancier (sans entité) ne compte pas", () => {
    const foreign: CollectionMandate = mandate(COMPANY, { creditorId: null });
    expect(refusalOf(judgeTestDebtor(facts({ mandates: [foreign] })))).toBeInstanceOf(
      CollectionTestNoMandateError,
    );
  });

  it("deux mandats actifs : refus plutôt que deviner le créancier", () => {
    const two = [mandate(COMPANY), mandate(COMPANY, { mandateId: "m_2", reference: "RUM-2" })];
    expect(refusalOf(judgeTestDebtor(facts({ mandates: two })))).toBeInstanceOf(
      CollectionTestAmbiguousMandateError,
    );
  });

  it("un mandat récurrent permet RCUR puis FRST — jamais FNAL ni OOFF", () => {
    const verdict = eligible(judgeTestDebtor(facts()));

    expect(verdict.sequences).toEqual(["RCUR", "FRST"]);
    expect(verdict.sequences).not.toContain("FNAL");
  });

  it("un mandat ponctuel inutilisé permet OOFF seul", () => {
    const oneOff = mandate(COMPANY, { paymentType: "one_off" });
    expect(eligible(judgeTestDebtor(facts({ mandates: [oneOff] }))).sequences).toEqual(["OOFF"]);
  });

  it("un mandat ponctuel qu'un lot réel a pris est refusé (OOFF consommerait le mandat)", () => {
    const oneOff = mandate(COMPANY, { paymentType: "one_off" });
    const verdict = judgeTestDebtor(
      facts({ mandates: [oneOff], batchedMandateIds: new Set([oneOff.mandateId]) }),
    );

    expect(refusalOf(verdict)).toBeInstanceOf(CollectionTestOneOffUsedError);
  });

  it("un mandat récurrent pris par un lot reste essayable en RCUR/FRST", () => {
    const recurrent = mandate(COMPANY);
    const verdict = judgeTestDebtor(facts({ batchedMandateIds: new Set([recurrent.mandateId]) }));

    expect(eligible(verdict).sequences).toEqual(["RCUR", "FRST"]);
  });

  it("une séquence hors de la liste est refusée, en nommant celles qui passent", () => {
    const verdict = eligible(judgeTestDebtor(facts()));

    expect(() => admittedSequence(verdict, "OOFF")).toThrow(CollectionTestSequenceMismatchError);
    expect(() => admittedSequence(verdict, "OOFF")).toThrow(/RCUR, FRST/u);
    expect(admittedSequence(verdict, "FRST")).toBe("FRST");
  });
});
