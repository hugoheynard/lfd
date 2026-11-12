import { PayerBillingModeAlreadyChosenError } from "../../errors/billing-mode-errors.js";
import { defaultModes, paris } from "../../services/__tests__/billing-mode-fixtures.js";
import type { BillingMode } from "../../value-objects/billing-mode.js";
import { PayerBillingModeHistory, type PayerModeEntry } from "../payer-billing-mode-history.js";

const PAYER = { id: "cmp_1", name: "Le Bistrot" };
const AT = paris("2026-10-08");
const gesture = { segmentId: "seg_new", at: AT, staffId: "staff_1" };
const OPENING = { opening: true };

function entry(mode: BillingMode, cancelledAt: Date | null = null): PayerModeEntry {
  return {
    id: `seg_${mode}`,
    effectiveFrom: paris("2026-10-01"),
    mode,
    createdAt: paris("2026-10-02"),
    createdByStaffId: "staff_0",
    cancelledAt,
    cancelledByStaffId: cancelledAt === null ? null : "staff_0",
  };
}

const history = (entries: readonly PayerModeEntry[] = []): PayerBillingModeHistory =>
  PayerBillingModeHistory.reconstitute("le1", PAYER, entries);

describe("PayerBillingModeHistory.chooseFirst — le premier choix", () => {
  it("sans segment vivant : la règle du changement, immédiat à l'ouverture", () => {
    const payer = history();
    expect(payer.chooseFirst("weekly", gesture, defaultModes(), OPENING)).toMatchObject({
      to: "weekly",
      immediate: true,
      effectiveAt: paris("2026-10-01"),
    });
    expect(payer.toPersistence().freshIds).toEqual(["seg_new"]);
  });

  it("un segment annulé ne compte pas pour un choix", () => {
    const payer = history([entry("semimonthly", paris("2026-10-03"))]);
    expect(payer.chooseFirst("weekly", gesture, defaultModes(), OPENING)).not.toBeNull();
  });

  it("refuse un autre mode quand un choix vit, en renvoyant à la carte de la fiche", () => {
    const payer = history([entry("monthly")]);
    const attempt = (): unknown => payer.chooseFirst("weekly", gesture, defaultModes(), OPENING);
    expect(attempt).toThrow(PayerBillingModeAlreadyChosenError);
    expect(attempt).toThrow(/« Le Bistrot ».*« Mode de facturation »/su);
    expect(payer.toPersistence().freshIds).toEqual([]);
  });

  it("le même mode redemandé : rien, sans refus", () => {
    const payer = history([entry("weekly")]);
    expect(payer.chooseFirst("weekly", gesture, defaultModes(), OPENING)).toBeNull();
    expect(payer.toPersistence().freshIds).toEqual([]);
  });
});
