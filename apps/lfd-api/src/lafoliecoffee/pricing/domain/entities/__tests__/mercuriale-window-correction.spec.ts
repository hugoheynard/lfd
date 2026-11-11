import { CompanyMercuriale } from "../company-mercuriale.js";
import { checkedWindowCorrectionReason } from "../mercuriale-window-correction.js";
import {
  AmendmentOutsideCorrectedWindowError,
  ArchivedMercurialeIsSealedError,
  MercurialeAlreadyStartedError,
  MissingWindowCorrectionReasonError,
  PastCorrectedStartError,
  PausedMercurialeWindowError,
  ReversedValidityWindowError,
} from "../../pricing-errors.js";

/**
 * **Corriger les dates d'une mercuriale** (`plan-corriger-les-dates.md`,
 * C1 à C4, C7). Les dates ne sont comparées qu'entre elles et à `NOW`, un
 * instant de la fixture passé en paramètre : aucune ne rencontre l'horloge.
 */

// 10 h à Paris le 1er mars : minuit à Paris est déjà passé.
const NOW = new Date("2026-03-01T09:00:00.000Z");
const PARIS_MIDNIGHT_TODAY = new Date("2026-02-28T23:00:00.000Z");
const PARIS_MIDNIGHT_YESTERDAY = new Date("2026-02-27T23:00:00.000Z");
const APRIL = new Date("2026-03-31T22:00:00.000Z");
const MAY = new Date("2026-04-30T22:00:00.000Z");
const JUNE = new Date("2026-05-31T22:00:00.000Z");
const JULY = new Date("2026-06-30T22:00:00.000Z");
// L'erreur : posée en 2027 au lieu de 2026.
const NEXT_YEAR = new Date("2027-03-31T22:00:00.000Z");

const scheduled = (from = NEXT_YEAR, to: Date | null = null): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: from,
      validTo: to,
    },
    "staff|marie",
  );

/** Un avenant de mai à juin, écrit quand la mercuriale commençait en avril. */
const withAmendment = (to: Date | null = JUNE): CompanyMercuriale =>
  scheduled(APRIL, null).amend(
    "amd_1",
    {
      lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      endedSkus: [],
      validFrom: MAY,
      validTo: to,
      reason: "Nouvelle référence",
      origin: null,
    },
    "staff|paul",
    NOW,
  );

describe("CompanyMercuriale.correctWindow", () => {
  it("déplace le début et la fin d'une mercuriale à venir, sans toucher la grille", () => {
    const before = scheduled();
    const after = before.correctWindow(APRIL, JULY, NOW).toPersistence();

    expect(after.validFrom).toEqual(APRIL);
    expect(after.validTo).toEqual(JULY);
    expect(after.lines).toEqual(before.lines);
  });

  it("rend un nouvel agrégat et laisse l'ancien intact", () => {
    const before = scheduled();
    before.correctWindow(APRIL, null, NOW);

    expect(before.toPersistence().validFrom).toEqual(NEXT_YEAR);
  });

  it("C1 : refuse une mercuriale commencée, en disant de la clore puis d'en reposer une", () => {
    const started = scheduled(PARIS_MIDNIGHT_YESTERDAY);

    expect(() => started.correctWindow(APRIL, null, NOW)).toThrow(MercurialeAlreadyStartedError);
    expect(() => started.correctWindow(APRIL, null, NOW)).toThrow(
      /clôturez-la, puis posez-en une autre/,
    );
  });

  it("C1 : refuse une mercuriale dont le début tombe pile à l'instant de la correction", () => {
    expect(() => scheduled(NOW).correctWindow(APRIL, null, NOW)).toThrow(
      MercurialeAlreadyStartedError,
    );
  });

  it("C1 : refuse une mercuriale en pause", () => {
    const state = scheduled().toPersistence();
    const paused = CompanyMercuriale.reconstitute({
      ...state,
      lifecycle: { ...state.lifecycle, pausedAt: NOW, pausedBy: "staff|marie" },
    });

    expect(() => paused.correctWindow(APRIL, null, NOW)).toThrow(PausedMercurialeWindowError);
  });

  it("C1 : refuse une mercuriale close", () => {
    const closed = scheduled().close("staff|marie", NOW, null);

    expect(() => closed.correctWindow(APRIL, null, NOW)).toThrow(ArchivedMercurialeIsSealedError);
  });

  it("C2 : accepte un début à minuit à Paris aujourd'hui, déjà passé à l'heure de la correction", () => {
    const after = scheduled().correctWindow(PARIS_MIDNIGHT_TODAY, null, NOW).toPersistence();

    expect(after.validFrom).toEqual(PARIS_MIDNIGHT_TODAY);
  });

  it("C2 : refuse un nouveau début hier", () => {
    expect(() => scheduled().correctWindow(PARIS_MIDNIGHT_YESTERDAY, null, NOW)).toThrow(
      PastCorrectedStartError,
    );
  });

  it("C3 : refuse une fin avant ou au nouveau début", () => {
    expect(() => scheduled().correctWindow(MAY, APRIL, NOW)).toThrow(ReversedValidityWindowError);
    expect(() => scheduled().correctWindow(MAY, MAY, NOW)).toThrow(ReversedValidityWindowError);
  });

  it("C3 : accepte une mercuriale sans fin", () => {
    expect(scheduled(APRIL, JULY).correctWindow(MAY, null, NOW).toPersistence().validTo).toBeNull();
  });

  it("C4 : garde un avenant qui tient dans la nouvelle période", () => {
    const after = withAmendment().correctWindow(MAY, JULY, NOW);

    expect(after.amendments.map((amendment) => amendment.validFrom)).toEqual([MAY]);
  });

  it("C4 : refuse un nouveau début après celui d'un avenant, en le nommant", () => {
    expect(() => withAmendment().correctWindow(JUNE, null, NOW)).toThrow(
      AmendmentOutsideCorrectedWindowError,
    );
    expect(() => withAmendment().correctWindow(JUNE, null, NOW)).toThrow(/avenant du 1er mai 2026/);
  });

  it("C4 : refuse une nouvelle fin avant celle d'un avenant", () => {
    expect(() => withAmendment().correctWindow(APRIL, MAY, NOW)).toThrow(
      AmendmentOutsideCorrectedWindowError,
    );
  });

  it("C4 : un avenant sans fin suit la nouvelle fin, s'il commence avant elle", () => {
    expect(withAmendment(null).correctWindow(APRIL, JUNE, NOW).toPersistence().validTo).toEqual(
      JUNE,
    );
    expect(() => withAmendment(null).correctWindow(APRIL, MAY, NOW)).toThrow(
      AmendmentOutsideCorrectedWindowError,
    );
  });

  it("C4 : ignore un avenant rangé", () => {
    const state = withAmendment().toPersistence();
    const archived = CompanyMercuriale.reconstitute({
      ...state,
      amendments: state.amendments.map((amendment) => ({
        ...amendment,
        archivedAt: NOW,
        archivedBy: "staff|marie",
        archiveReason: null,
      })),
    });

    expect(archived.correctWindow(JUNE, null, NOW).toPersistence().validFrom).toEqual(JUNE);
  });
});

describe("checkedWindowCorrectionReason (C7)", () => {
  it("refuse un motif vide ou blanc", () => {
    expect(() => checkedWindowCorrectionReason("   ")).toThrow(MissingWindowCorrectionReasonError);
  });

  it("rend le motif sans ses blancs de bord", () => {
    expect(checkedWindowCorrectionReason("  posée en 2027 par erreur ")).toBe(
      "posée en 2027 par erreur",
    );
  });
});
