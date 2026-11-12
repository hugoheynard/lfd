import {
  CollectionMeansChangePendingError,
  CollectionMeansReasonRequiredError,
  CollectionMeansReasonTooLongError,
  CollectionMeansReturnPendingError,
  NoScheduledCollectionMeansError,
} from "../../errors/collection-means-errors.js";
import { defaultModes, paris } from "../../services/__tests__/billing-mode-fixtures.js";
import type { PayerMeansEntry } from "../../services/collection-means-timeline.js";
import { PayerTimeline } from "../../services/payer-timeline.js";
import {
  COLLECTION_MEANS_REASON_MAX,
  type CollectionMeans,
} from "../../value-objects/collection-means.js";
import { PayerCollectionMeansHistory } from "../payer-collection-means-history.js";

const PAYER = { id: "cmp_1", name: "Le Bistrot" };
const REASON = "Le client le demande par écrit";
const gesture = (at: Date, reason = REASON) => ({
  segmentId: "seg_new",
  at,
  staffId: "staff_1",
  reason,
});
/** Les clôtures d'un payeur resté au mensuel par défaut (le 1er). */
const MONTHLY = PayerTimeline.of([], defaultModes());
/** Les clôtures d'un payeur hebdomadaire depuis le 1er octobre (le lundi). */
const WEEKLY = PayerTimeline.of(
  [{ effectiveFrom: paris("2026-10-01"), mode: "weekly", writtenAt: paris("2026-09-20") }],
  defaultModes(),
);
const ORDERED = { opening: false, returnPending: false };
const OPENING = { opening: true, returnPending: false };

function entry(
  effectiveFrom: Date,
  means: CollectionMeans,
  createdAt = paris("2026-09-01"),
): PayerMeansEntry {
  return {
    id: `seg_${effectiveFrom.toISOString()}`,
    effectiveFrom,
    means,
    reason: REASON,
    createdAt,
    createdByStaffId: "staff_0",
    cancelledAt: null,
    cancelledByStaffId: null,
  };
}

const history = (entries: readonly PayerMeansEntry[] = []): PayerCollectionMeansHistory =>
  PayerCollectionMeansHistory.reconstitute("le1", PAYER, entries);

describe("PayerCollectionMeansHistory — le moyen d'encaissement d'un payeur (V1, V2, V10)", () => {
  it("un payeur qui a commandé passe au virement à la prochaine clôture de son mode", () => {
    const payer = history();

    expect(payer.change("bank_transfer", gesture(paris("2026-10-08")), MONTHLY, ORDERED)).toEqual({
      kind: "scheduled",
      from: "sepa_debit",
      to: "bank_transfer",
      effectiveAt: paris("2026-11-01"),
      immediate: false,
      reason: REASON,
    });
    expect(payer.toPersistence().freshIds).toEqual(["seg_new"]);
  });

  it("la prochaine clôture est celle du MODE du payeur — le lundi d'un hebdomadaire", () => {
    const change = history().change("bank_transfer", gesture(paris("2026-10-08")), WEEKLY, ORDERED);
    expect(change?.effectiveAt).toEqual(paris("2026-10-12"));
  });

  it("un payeur qui n'a jamais commandé y passe tout de suite, daté de sa dernière clôture", () => {
    const change = history().change(
      "bank_transfer",
      gesture(paris("2026-10-08")),
      MONTHLY,
      OPENING,
    );
    expect(change).toMatchObject({ immediate: true, effectiveAt: paris("2026-10-01") });
  });

  it("un segment écrit depuis la dernière clôture interdit un second immédiat", () => {
    const payer = history([entry(paris("2026-10-01"), "bank_transfer", paris("2026-10-03"))]);
    const change = payer.change("sepa_debit", gesture(paris("2026-10-08")), MONTHLY, OPENING);
    expect(change).toMatchObject({ immediate: false, effectiveAt: paris("2026-11-01") });
  });

  it("un segment annulé ne compte pas pour l'immédiat", () => {
    const cancelled = {
      ...entry(paris("2026-11-01"), "bank_transfer", paris("2026-10-03")),
      cancelledAt: paris("2026-10-04"),
      cancelledByStaffId: "staff_0",
    };
    const change = history([cancelled]).change(
      "bank_transfer",
      gesture(paris("2026-10-08")),
      MONTHLY,
      OPENING,
    );
    expect(change).toMatchObject({ immediate: true, effectiveAt: paris("2026-10-01") });
  });

  it("le moyen déjà en vigueur, redemandé : rien", () => {
    expect(
      history().change("sepa_debit", gesture(paris("2026-10-08")), MONTHLY, ORDERED),
    ).toBeNull();
    expect(
      history([entry(paris("2026-09-01"), "bank_transfer")]).change(
        "bank_transfer",
        gesture(paris("2026-10-08")),
        MONTHLY,
        ORDERED,
      ),
    ).toBeNull();
  });

  it("le moyen déjà programmé, redemandé : rien — un rejeu ne double pas le segment", () => {
    const payer = history([entry(paris("2026-11-01"), "bank_transfer", paris("2026-10-05"))]);
    expect(
      payer.change("bank_transfer", gesture(paris("2026-10-08")), MONTHLY, ORDERED),
    ).toBeNull();
    expect(payer.toPersistence().freshIds).toEqual([]);
  });

  it("refuse un autre moyen avant la prise d'effet du programmé, en nommant la date", () => {
    const again = history([entry(paris("2026-11-01"), "bank_transfer", paris("2026-10-05"))]);
    // Revenir au prélèvement alors que le virement est programmé : annuler d'abord.
    const attempt = (): unknown =>
      again.change("sepa_debit", gesture(paris("2026-10-08")), MONTHLY, ORDERED);
    expect(attempt).toThrow(CollectionMeansChangePendingError);
    expect(attempt).toThrow(/« Le Bistrot ».*1er novembre 2026.*annulez d'abord/su);
  });

  it("refuse pendant un retour bancaire en cours (V10)", () => {
    const attempt = (): unknown =>
      history().change("bank_transfer", gesture(paris("2026-10-08")), MONTHLY, {
        opening: false,
        returnPending: true,
      });
    expect(attempt).toThrow(CollectionMeansReturnPendingError);
    expect(attempt).toThrow(/retour bancaire en cours/u);
  });

  it("refuse un motif vide ou blanc, et un motif trop long", () => {
    const payer = history();
    expect(() =>
      payer.change("bank_transfer", gesture(paris("2026-10-08"), "   "), MONTHLY, ORDERED),
    ).toThrow(CollectionMeansReasonRequiredError);
    expect(() =>
      payer.change(
        "bank_transfer",
        gesture(paris("2026-10-08"), "x".repeat(COLLECTION_MEANS_REASON_MAX + 1)),
        MONTHLY,
        ORDERED,
      ),
    ).toThrow(CollectionMeansReasonTooLongError);
  });

  it("garde le motif sans ses blancs de bord", () => {
    const change = history().change(
      "bank_transfer",
      gesture(paris("2026-10-08"), `  ${REASON}  `),
      MONTHLY,
      ORDERED,
    );
    expect(change?.reason).toBe(REASON);
  });

  it("annule le programmé avant sa prise d'effet ; le moyen d'avant reste", () => {
    const payer = history([entry(paris("2026-11-01"), "bank_transfer", paris("2026-10-05"))]);
    expect(payer.cancelScheduled({ at: paris("2026-10-08"), staffId: "staff_2" })).toEqual({
      kind: "cancelled",
      from: "bank_transfer",
      to: "sepa_debit",
      effectiveAt: paris("2026-11-01"),
      immediate: false,
      reason: null,
    });
    const record = payer.toPersistence();
    expect(record.cancelledIds).toHaveLength(1);
    expect(record.entries[0]).toMatchObject({ cancelledByStaffId: "staff_2" });
  });

  it("refuse d'annuler ce qui a déjà pris effet, ou rien", () => {
    const payer = history([entry(paris("2026-10-01"), "bank_transfer")]);
    expect(() => payer.cancelScheduled({ at: paris("2026-10-08"), staffId: "s" })).toThrow(
      NoScheduledCollectionMeansError,
    );
  });
});
