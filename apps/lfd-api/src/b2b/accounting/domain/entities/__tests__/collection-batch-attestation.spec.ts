import {
  CollectionBatchAttestations,
  batchAttestationKindOf,
  type AttestedBatch,
  type BatchAttestationEntry,
} from "../collection-batch-attestation.js";
import type { CollectionBatchStatus } from "../collection-batch-status.js";
import {
  BatchAttestationAlreadyGivenError,
  BatchAttestationNotGivenError,
  BatchAttestationOutOfOrderError,
  InvalidBatchAttestationError,
} from "../../errors/collection-batch-attestation-errors.js";

/**
 * Les attestations d'un lot (plan `plan-page-procedure-de-prelevement.md`
 * § 1.2, § 3.3) : un registre d'ajouts où la dernière ligne d'une sorte fait
 * foi, et l'ordre de la procédure. Les instants ne se comparent qu'entre eux.
 */

const AT = new Date("2026-11-13T09:00:00.000Z");
const LATER = new Date("2026-11-13T10:00:00.000Z");

function batch(status: CollectionBatchStatus = "deposited"): AttestedBatch {
  return {
    id: "b1",
    legalEntityId: "le1",
    scheme: "CORE",
    status,
    cycleClosesAt: new Date("2026-10-31T23:00:00.000Z"),
  };
}

function of(
  status: CollectionBatchStatus = "deposited",
  entries: readonly BatchAttestationEntry[] = [],
): CollectionBatchAttestations {
  return CollectionBatchAttestations.rehydrate({ batch: batch(status), entries });
}

const staff = (staffId = "staff_1", at = AT) => ({ at, staffId });

describe("CollectionBatchAttestations — attester", () => {
  it("ajoute une ligne, et elle fait foi", () => {
    const attestations = of();

    const entry = attestations.attest("remittance_signed", "a1", staff());

    expect(entry).toEqual({
      id: "a1",
      batchId: "b1",
      kind: "remittance_signed",
      at: AT,
      staffId: "staff_1",
      withdrawn: false,
      note: null,
    });
    expect(attestations.standing("remittance_signed")?.id).toBe("a1");
    expect(attestations.standing("psr_read")).toBeNull();
    expect(attestations.newEntries()).toEqual([entry]);
  });

  it("refuse une seconde attestation de la même sorte", () => {
    const attestations = of();
    attestations.attest("psr_read", "a1", staff());

    expect(() => attestations.attest("psr_read", "a2", staff())).toThrow(
      BatchAttestationAlreadyGivenError,
    );
  });

  it("le contrôle CSV se relit avant le dépôt", () => {
    expect(of("constituted").attest("audit_reviewed", "a1", staff()).kind).toBe("audit_reviewed");
  });

  it("la remise ne se signe pas avant « J'ai déposé », et le refus dit le geste de sortie", () => {
    expect(() => of("constituted").attest("remittance_signed", "a1", staff())).toThrow(
      /J'ai déposé le fichier dans CENET/u,
    );
    expect(() => of("constituted").attest("psr_read", "a1", staff())).toThrow(
      BatchAttestationOutOfOrderError,
    );
  });

  it("un lot annulé n'atteste plus rien ; un lot rejeté n'a plus de remise à signer", () => {
    expect(() => of("cancelled").attest("audit_reviewed", "a1", staff())).toThrow(
      BatchAttestationOutOfOrderError,
    );
    expect(() => of("rejected_by_bank").attest("remittance_signed", "a1", staff())).toThrow(
      BatchAttestationOutOfOrderError,
    );
    expect(of("rejected_by_bank").attest("psr_read", "a1", staff()).kind).toBe("psr_read");
  });
});

describe("CollectionBatchAttestations — retirer (la dernière ligne fait foi)", () => {
  const given: BatchAttestationEntry = {
    id: "a1",
    batchId: "b1",
    kind: "remittance_signed",
    at: AT,
    staffId: "staff_1",
    withdrawn: false,
    note: null,
  };

  it("ajoute un retrait avec sa note : rien ne s'efface, la sorte n'est plus attestée", () => {
    const attestations = of("deposited", [given]);

    const entry = attestations.withdraw(
      "remittance_signed",
      "a2",
      staff("s2", LATER),
      "  pas signé ",
    );

    expect(entry).toMatchObject({ withdrawn: true, note: "pas signé" });
    expect(attestations.standing("remittance_signed")).toBeNull();
    expect(attestations.newEntries()).toEqual([entry]);
  });

  it("retirée, la sorte s'atteste de nouveau, et la plus récente fait foi", () => {
    const withdrawal = { ...given, id: "a2", at: LATER, withdrawn: true, note: "erreur" };
    const attestations = of("deposited", [given, withdrawal]);

    attestations.attest("remittance_signed", "a3", staff("s3", new Date(LATER.getTime() + 1)));

    expect(attestations.standing("remittance_signed")?.staffId).toBe("s3");
  });

  it("un retrait se fait quel que soit l'état du lot", () => {
    expect(
      of("cancelled", [given]).withdraw("remittance_signed", "a2", staff(), "x").withdrawn,
    ).toBe(true);
  });

  it("refuse de retirer ce qui n'est pas attesté, et un retrait sans raison", () => {
    expect(() => of().withdraw("psr_read", "a2", staff(), "x")).toThrow(
      BatchAttestationNotGivenError,
    );
    expect(() =>
      of("deposited", [given]).withdraw("remittance_signed", "a2", staff(), "  "),
    ).toThrow(InvalidBatchAttestationError);
    expect(() =>
      of("deposited", [given]).withdraw("remittance_signed", "a2", staff(), "x".repeat(501)),
    ).toThrow(InvalidBatchAttestationError);
  });
});

describe("CollectionBatchAttestations — relecture", () => {
  it("refuse une ligne d'un autre lot, et une sorte inconnue", () => {
    const stray: BatchAttestationEntry = {
      id: "a1",
      batchId: "autre",
      kind: "psr_read",
      at: AT,
      staffId: "s",
      withdrawn: false,
      note: null,
    };
    expect(() => of("deposited", [stray])).toThrow(InvalidBatchAttestationError);
    expect(() => batchAttestationKindOf("csv_reviewed")).toThrow(InvalidBatchAttestationError);
    expect(batchAttestationKindOf("psr_read")).toBe("psr_read");
  });
});
