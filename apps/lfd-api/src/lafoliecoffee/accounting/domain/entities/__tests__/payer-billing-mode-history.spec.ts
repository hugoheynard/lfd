import {
  NoScheduledPayerBillingModeError,
  PayerBillingModeChangePendingError,
} from "../../errors/billing-mode-errors.js";
import { MeansChangeBlocksModeChangeError } from "../../errors/payer-change-pending-errors.js";
import { defaultModes, paris } from "../../services/__tests__/billing-mode-fixtures.js";
import { ModeDatesTimeline } from "../../services/mode-dates-timeline.js";
import type { BillingMode } from "../../value-objects/billing-mode.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { PayerBillingModeHistory, type PayerModeEntry } from "../payer-billing-mode-history.js";

const PAYER = { id: "cmp_1", name: "Le Bistrot" };
const gesture = (at: Date) => ({ segmentId: "seg_new", at, staffId: "staff_1" });
/** Le payeur a déjà commandé : le changement est programmé. */
const ORDERED = { opening: false, pendingMeans: null };
/** Le payeur n'a jamais commandé : première condition de l'immédiat. */
const OPENING = { opening: true, pendingMeans: null };

function entry(effectiveFrom: Date, mode: BillingMode): PayerModeEntry {
  return {
    id: `seg_${effectiveFrom.toISOString()}`,
    effectiveFrom,
    mode,
    createdAt: paris("2026-10-01"),
    createdByStaffId: "staff_0",
    cancelledAt: null,
    cancelledByStaffId: null,
  };
}

const history = (entries: readonly PayerModeEntry[] = []): PayerBillingModeHistory =>
  PayerBillingModeHistory.reconstitute("le1", PAYER, entries);

describe("PayerBillingModeHistory — le mode d'un payeur (§16.1, §16.6)", () => {
  it("mensuel par défaut → hebdomadaire à la prochaine clôture du mensuel", () => {
    const payer = history();

    expect(payer.change("weekly", gesture(paris("2026-10-08")), defaultModes(), ORDERED)).toEqual({
      kind: "scheduled",
      from: "monthly",
      to: "weekly",
      effectiveAt: paris("2026-11-01"),
      immediate: false,
    });
    expect(payer.toPersistence().freshIds).toEqual(["seg_new"]);
  });

  it("le mode qu'il a déjà choisi, redemandé : rien", () => {
    const payer = history([entry(paris("2026-10-01"), "monthly")]);
    expect(
      payer.change("monthly", gesture(paris("2026-10-08")), defaultModes(), ORDERED),
    ).toBeNull();
  });

  it("refuse un second changement avant la prise d'effet, en nommant le payeur et la date", () => {
    const payer = history([entry(paris("2026-11-01"), "weekly")]);
    const attempt = (): unknown =>
      payer.change("semimonthly", gesture(paris("2026-10-20")), defaultModes(), ORDERED);

    expect(attempt).toThrow(PayerBillingModeChangePendingError);
    expect(attempt).toThrow(/« Le Bistrot ».*1er novembre 2026.*annulez d'abord/su);
  });

  it("la prise d'effet suit sa timeline ACTUELLE : hebdomadaire depuis le 1er, le lundi suivant", () => {
    const payer = history([entry(paris("2026-11-01"), "weekly")]);

    expect(
      payer.change("monthly", gesture(paris("2026-11-03")), defaultModes(), ORDERED),
    ).toMatchObject({
      from: "weekly",
      effectiveAt: paris("2026-11-09"),
    });
  });

  it("…et les dates déjà basculées de son mode", () => {
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });

    expect(history().change("weekly", gesture(paris("2026-11-03")), modes, ORDERED)).toMatchObject({
      effectiveAt: paris("2026-11-15"),
    });
  });

  it("des dates programmées de son mode prennent effet à SA prochaine clôture : le payeur bascule au même instant", () => {
    // Le programmé tombe sur une clôture de la suite actuelle : il ne la déplace pas.
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });
    expect(history().change("weekly", gesture(paris("2026-10-08")), modes, ORDERED)).toMatchObject({
      effectiveAt: paris("2026-11-01"),
    });
  });

  it("annule le programmé : le mode d'avant reste, la ligne aussi", () => {
    const payer = history([
      entry(paris("2026-11-01"), "weekly"),
      entry(paris("2026-12-07"), "semimonthly"),
    ]);

    expect(payer.cancelScheduled({ at: paris("2026-11-20"), staffId: "staff_2" })).toEqual({
      kind: "cancelled",
      from: "semimonthly",
      to: "weekly",
      effectiveAt: paris("2026-12-07"),
      immediate: false,
    });
    expect(payer.toPersistence().entries).toHaveLength(2);
    expect(payer.timeline(defaultModes()).modeAt(paris("2026-12-10")).mode).toBe("weekly");
  });

  it("refuse d'annuler quand rien n'est programmé", () => {
    expect(() => history().cancelScheduled({ at: paris("2026-10-08"), staffId: "s" })).toThrow(
      NoScheduledPayerBillingModeError,
    );
  });
});

/** Un segment écrit à `createdAt`, annulé ou non. */
function written(
  effectiveFrom: Date,
  mode: BillingMode,
  createdAt: Date,
  cancelledAt: Date | null = null,
): PayerModeEntry {
  return { ...entry(effectiveFrom, mode), createdAt, cancelledAt };
}

describe("PayerBillingModeHistory — l'immédiat et le premier choix (plan changement de mode immédiat, §3.2-3.3)", () => {
  const AT = paris("2026-11-12", "11:00");

  it("jamais commandé : immédiat, daté de la dernière clôture C0, écrit au geste", () => {
    const payer = history();

    expect(payer.change("weekly", gesture(AT), defaultModes(), OPENING)).toEqual({
      kind: "scheduled",
      from: "monthly",
      to: "weekly",
      effectiveAt: paris("2026-11-01"),
      immediate: true,
    });
    expect(payer.toPersistence().entries).toEqual([
      expect.objectContaining({ effectiveFrom: paris("2026-11-01"), createdAt: AT }),
    ]);
    expect(payer.timeline(defaultModes()).modeAt(AT).mode).toBe("weekly");
  });

  it("refus 1 — il a déjà commandé : programmé à la prochaine clôture", () => {
    expect(history().change("weekly", gesture(AT), defaultModes(), ORDERED)).toMatchObject({
      effectiveAt: paris("2026-12-01"),
      immediate: false,
    });
  });

  it("refus 2 — un segment vivant commence à C0 : programmé", () => {
    // Hebdomadaire depuis le 1er (programmé en octobre) ; le 1er à midi, C0 est le 1er lui-même.
    const payer = history([written(paris("2026-11-01"), "weekly", paris("2026-10-01"))]);

    expect(
      payer.change("monthly", gesture(paris("2026-11-01", "12:00")), defaultModes(), OPENING),
    ).toMatchObject({ effectiveAt: paris("2026-11-02"), immediate: false });
  });

  it("refus 3 — un segment vivant a été écrit depuis C0 : un seul immédiat par période", () => {
    // Hebdomadaire depuis le 1er, écrit le 10 : sa dernière clôture (le 9) précède l'écriture.
    const payer = history([written(paris("2026-11-01"), "weekly", paris("2026-11-10"))]);

    expect(payer.change("semimonthly", gesture(AT), defaultModes(), OPENING)).toMatchObject({
      immediate: false,
    });
  });

  /**
   * Régression : un changement programmé avant la mise en service de l'immédiat,
   * puis annulé, empêchait l'immédiat du client qui n'avait jamais commandé.
   */
  it("un segment annulé ne retient pas l'immédiat : il n'a jamais valu", () => {
    const payer = history([
      written(paris("2026-12-01"), "weekly", paris("2026-11-05"), paris("2026-11-06")),
    ]);

    expect(payer.change("weekly", gesture(AT), defaultModes(), OPENING)).toMatchObject({
      effectiveAt: paris("2026-11-01"),
      immediate: true,
    });
  });

  it("le premier choix écrit un segment même s'il redemande le mensuel — immédiat ou programmé", () => {
    const opening = history();
    expect(opening.change("monthly", gesture(AT), defaultModes(), OPENING)).toMatchObject({
      from: "monthly",
      to: "monthly",
      effectiveAt: paris("2026-11-01"),
      immediate: true,
    });
    expect(opening.toPersistence().freshIds).toEqual(["seg_new"]);

    const ordered = history();
    expect(ordered.change("monthly", gesture(AT), defaultModes(), ORDERED)).toMatchObject({
      effectiveAt: paris("2026-12-01"),
      immediate: false,
    });
  });

  it("un choix seulement annulé n'est pas un choix : le premier geste écrit encore", () => {
    const payer = history([
      written(paris("2026-11-01"), "weekly", paris("2026-10-01"), paris("2026-10-02")),
    ]);
    expect(payer.change("monthly", gesture(AT), defaultModes(), ORDERED)).not.toBeNull();
  });
});

describe("PayerBillingModeHistory — un seul changement en attente, mode et moyen confondus (K1)", () => {
  it("refuse un mode tant qu'un moyen est programmé, en nommant le moyen et sa date", () => {
    const attempt = (): unknown =>
      history().change("weekly", gesture(paris("2026-10-08")), defaultModes(), {
        opening: false,
        pendingMeans: { means: "bank_transfer", effectiveFrom: paris("2026-11-01") },
      });

    expect(attempt).toThrow(MeansChangeBlocksModeChangeError);
    expect(attempt).toThrow(/passe déjà au virement bancaire le 1er novembre 2026/u);
  });

  it("refuse aussi un mode IMMÉDIAT : il déplacerait la clôture où le moyen tombe", () => {
    const attempt = (): unknown =>
      history().change("weekly", gesture(paris("2026-10-08")), defaultModes(), {
        opening: true,
        pendingMeans: { means: "bank_transfer", effectiveFrom: paris("2026-11-01") },
      });

    expect(attempt).toThrow(MeansChangeBlocksModeChangeError);
  });
});
