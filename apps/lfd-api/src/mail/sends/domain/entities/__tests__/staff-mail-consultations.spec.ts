import { MailConsultationLimitReachedError } from "../../errors/mail-sends.errors.js";
import {
  consultationWindowStart,
  isRevealCurrent,
  MAIL_CONSULTATIONS_PER_HOUR,
  MAIL_REVEAL_VALIDITY_MS,
  revealedUntil,
  StaffMailConsultations,
} from "../staff-mail-consultations.js";

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

describe("StaffMailConsultations — le plafond horaire (décisions 7 et 8)", () => {
  it("range une révélation : qui, quel envoi, quand — rien d'autre", () => {
    const consultations = StaffMailConsultations.of("fiche-colette", 0, null);
    consultations.reveal("rev_1", "send_1", NOW);
    expect(consultations.newReveals()).toEqual([
      { id: "rev_1", sendId: "send_1", staffId: "fiche-colette", at: NOW },
    ]);
  });

  it("admet la trentième consultation de l'heure", () => {
    const consultations = StaffMailConsultations.of(
      "fiche-colette",
      MAIL_CONSULTATIONS_PER_HOUR - 1,
      NOW,
    );
    expect(() => consultations.reveal("rev_30", "send_1", NOW)).not.toThrow();
  });

  it("refuse la trente-et-unième, en nommant le plafond", () => {
    const oldest = new Date(NOW.getTime() - 20 * 60_000);
    const consultations = StaffMailConsultations.of(
      "fiche-colette",
      MAIL_CONSULTATIONS_PER_HOUR,
      oldest,
    );
    const attempt = () => consultations.reveal("rev_31", "send_1", NOW);
    expect(attempt).toThrow(MailConsultationLimitReachedError);
    expect(attempt).toThrow(/30 adresses ou recherches dans l'heure/u);
    expect(consultations.newReveals()).toEqual([]);
  });

  it("compte aussi les révélations du même chargement", () => {
    const consultations = StaffMailConsultations.of(
      "fiche-colette",
      MAIL_CONSULTATIONS_PER_HOUR - 1,
      NOW,
    );
    consultations.reveal("rev_30", "send_1", NOW);
    expect(() => consultations.reveal("rev_31", "send_2", NOW)).toThrow(
      MailConsultationLimitReachedError,
    );
  });

  it("dit quand reprendre : une heure après la plus ancienne consultation", () => {
    const oldest = new Date(NOW.getTime() - 20 * 60_000);
    const consultations = StaffMailConsultations.of("s", MAIL_CONSULTATIONS_PER_HOUR, oldest);
    let refusal: unknown = null;
    try {
      consultations.reveal("r", "send", NOW);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(MailConsultationLimitReachedError);
    expect(refusal).toMatchObject({ retryAt: new Date(NOW.getTime() + 40 * 60_000) });
  });

  it("la fenêtre du plafond est l'heure qui précède", () => {
    expect(consultationWindowStart(NOW)).toEqual(new Date(NOW.getTime() - 3_600_000));
  });
});

describe("la validité d'une révélation (5 minutes)", () => {
  it("vaut jusqu'à 5 minutes exclues", () => {
    expect(isRevealCurrent(NOW, NOW)).toBe(true);
    expect(isRevealCurrent(NOW, new Date(NOW.getTime() + MAIL_REVEAL_VALIDITY_MS - 1))).toBe(true);
    expect(isRevealCurrent(NOW, new Date(NOW.getTime() + MAIL_REVEAL_VALIDITY_MS))).toBe(false);
  });

  it("dit jusqu'à quand", () => {
    expect(revealedUntil(NOW)).toEqual(new Date(NOW.getTime() + 5 * 60_000));
  });
});

describe("StaffMailConsultations — la recherche par adresse (décision 8)", () => {
  it("range l'empreinte et les envois trouvés, jamais l'adresse", () => {
    const consultations = StaffMailConsultations.of("colette", 0, null);
    consultations.search("srch_1", "f".repeat(64), ["send_1", "send_2"], NOW);
    expect(consultations.newSearches()).toEqual([
      {
        id: "srch_1",
        staffId: "colette",
        fingerprint: "f".repeat(64),
        sendIds: ["send_1", "send_2"],
        at: NOW,
      },
    ]);
  });

  it("partage le plafond avec les révélations", () => {
    const consultations = StaffMailConsultations.of(
      "colette",
      MAIL_CONSULTATIONS_PER_HOUR - 1,
      NOW,
    );
    consultations.reveal("rev", "send_1", NOW);
    expect(() => consultations.search("srch", "f".repeat(64), [], NOW)).toThrow(
      MailConsultationLimitReachedError,
    );
    expect(consultations.newSearches()).toEqual([]);
  });
});
