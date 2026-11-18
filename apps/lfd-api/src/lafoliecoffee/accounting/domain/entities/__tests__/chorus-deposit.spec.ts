import {
  ChorusDeposit,
  CHORUS_REJECTION_REASON_MAX,
  type ChorusGesture,
  type ChorusInvoiceFacts,
} from "../chorus-deposit.js";
import {
  ChorusAlreadyDepositedError,
  ChorusDayOutOfRangeError,
  ChorusNotDepositedError,
  ChorusOutcomeKnownError,
  CreditedInvoiceNotForChorusError,
  InvalidChorusDepositError,
  InvoiceNotForChorusError,
} from "../../errors/chorus-deposit-errors.js";

// Jours comparés entre eux seulement : `today` est donné, aucune horloge.
const INVOICE: ChorusInvoiceFacts = {
  invoiceId: "inv_1",
  number: "FA-LFD-2026-000001",
  payerCompanyId: "c_army",
  payerName: "Base de défense",
  isCreditNote: false,
  buyerLegalForm: "public_state",
  issuedOn: "2026-09-30",
  dueOn: "2026-10-30",
  creditedOut: false,
};
const AT = new Date("2026-10-10T08:00:00.000Z");

const gesture = (occurredOn: string, entryId = "e1"): ChorusGesture => ({
  entryId,
  occurredOn,
  today: "2026-10-10",
  staffId: "s_compta",
  staffName: "Camille Compta",
  at: AT,
});

const fresh = (over: Partial<ChorusInvoiceFacts> = {}) =>
  ChorusDeposit.of({ ...INVOICE, ...over }, []);

describe("ChorusDeposit — le dépôt d'une facture publique sur Chorus Pro (T2′)", () => {
  it("déposée : une ligne neuve, l'auteur et son nom figés, l'échéance effective en part", () => {
    const deposit = fresh();

    const entry = deposit.deposit(gesture("2026-10-05"));

    expect(entry).toEqual({
      id: "e1",
      kind: "deposited",
      occurredOn: "2026-10-05",
      reason: null,
      staffId: "s_compta",
      staffName: "Camille Compta",
      recordedAt: AT,
    });
    expect(deposit.pending()).toEqual([entry]);
    expect(deposit.standing().depositedOn).toBe("2026-10-05");
  });

  it("une seule fois : un second dépôt est refusé, même après un rejet", () => {
    const deposit = fresh();
    deposit.deposit(gesture("2026-10-05"));
    deposit.reject(gesture("2026-10-06", "e2"), "Service inconnu");

    expect(() => deposit.deposit(gesture("2026-10-07", "e3"))).toThrow(ChorusAlreadyDepositedError);
  });

  it("rejet et mise en paiement seulement après le dépôt, et une seule de ces issues", () => {
    expect(() => fresh().reject(gesture("2026-10-05"), "motif")).toThrow(ChorusNotDepositedError);
    expect(() => fresh().accept(gesture("2026-10-05"))).toThrow(ChorusNotDepositedError);

    const accepted = fresh();
    accepted.deposit(gesture("2026-10-05"));
    accepted.accept(gesture("2026-10-08", "e2"));
    expect(() => accepted.reject(gesture("2026-10-09", "e3"), "motif")).toThrow(
      ChorusOutcomeKnownError,
    );
    expect(() => accepted.accept(gesture("2026-10-09", "e3"))).toThrow(ChorusOutcomeKnownError);
  });

  it("le rejet exige un motif, recopié sans ses blancs, et borné", () => {
    const deposit = fresh();
    deposit.deposit(gesture("2026-10-05"));

    expect(() => deposit.reject(gesture("2026-10-06", "e2"), "   ")).toThrow(
      InvalidChorusDepositError,
    );
    expect(() =>
      deposit.reject(gesture("2026-10-06", "e2"), "x".repeat(CHORUS_REJECTION_REASON_MAX + 1)),
    ).toThrow(InvalidChorusDepositError);
    expect(deposit.reject(gesture("2026-10-06", "e2"), "  Engagement inconnu ").reason).toBe(
      "Engagement inconnu",
    );
  });

  it("le jour saisi : pas avant la facture (ni avant le dépôt), pas dans le futur, un vrai jour", () => {
    expect(() => fresh().deposit(gesture("2026-09-29"))).toThrow(ChorusDayOutOfRangeError);
    expect(() => fresh().deposit(gesture("2026-10-11"))).toThrow(ChorusDayOutOfRangeError);
    expect(() => fresh().deposit(gesture("2026-02-31"))).toThrow(InvalidChorusDepositError);
    expect(fresh().deposit(gesture("2026-09-30")).occurredOn).toBe("2026-09-30");

    const deposit = fresh();
    deposit.deposit(gesture("2026-10-05"));
    expect(() => deposit.accept(gesture("2026-10-04", "e2"))).toThrow(ChorusDayOutOfRangeError);
  });

  it("seulement une facture (380) d'un organisme public, non annulée par un avoir", () => {
    expect(() => fresh({ buyerLegalForm: "SARL" }).deposit(gesture("2026-10-05"))).toThrow(
      InvoiceNotForChorusError,
    );
    expect(() => fresh({ isCreditNote: true, dueOn: null }).deposit(gesture("2026-10-05"))).toThrow(
      InvoiceNotForChorusError,
    );
    expect(() => fresh({ creditedOut: true }).deposit(gesture("2026-10-05"))).toThrow(
      CreditedInvoiceNotForChorusError,
    );
  });

  it("rechargée, seule la ligne neuve est à écrire (append-only)", () => {
    const loaded = ChorusDeposit.of(INVOICE, [
      {
        id: "e0",
        kind: "deposited",
        occurredOn: "2026-10-05",
        reason: null,
        staffId: "s_compta",
        staffName: null,
        recordedAt: AT,
      },
    ]);

    const entry = loaded.accept(gesture("2026-10-09", "e1"));

    expect(loaded.pending()).toEqual([entry]);
    expect(loaded.standing()).toEqual({
      depositedOn: "2026-10-05",
      rejectedOn: null,
      rejectionReason: null,
      acceptedOn: "2026-10-09",
    });
  });
});
