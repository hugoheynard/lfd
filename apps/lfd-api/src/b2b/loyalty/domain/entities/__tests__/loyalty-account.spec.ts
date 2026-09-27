import {
  EmptyAdjustmentError,
  InsufficientLoyaltyPointsError,
  InvalidEarnedPointsError,
  InvalidStepCountError,
  LoyaltyBalanceBelowZeroError,
  LoyaltyBalanceChangedError,
  LoyaltyProgramClosedError,
  LoyaltyProgramClosedToClienteleError,
  LoyaltyVoucherNotAvailableError,
} from "../../errors/loyalty-errors.js";
import { LoyaltyHolder } from "../../value-objects/loyalty-holder.js";
import { LoyaltyReason } from "../../value-objects/loyalty-reason.js";
import { LoyaltySettings } from "../../value-objects/loyalty-settings.js";
import { LoyaltyAccount, type LoyaltyConversion } from "../loyalty-account.js";

const AT = new Date("2026-01-10T09:00:00.000Z");
const PERSON = LoyaltyHolder.of("user", "u1");
const COMPANY = LoyaltyHolder.of("company", "c1");
const SETTINGS = LoyaltySettings.of({
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
});

function conversion(
  steps: number,
  settings: LoyaltySettings | null = SETTINGS,
  expectedBalance: number | null = null,
): LoyaltyConversion {
  return {
    steps,
    settings,
    voucherId: "v1",
    entryId: "e1",
    actorUserId: "u1",
    at: AT,
    expectedBalance,
  };
}

const act = { entryId: "e2", staffUserId: "staff_1", reason: LoyaltyReason.of("geste"), at: AT };

describe("LoyaltyAccount.convert — des points contre un bon", () => {
  it("émet un bon de paliers entiers et débite exactement leur coût", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 2_340);
    const voucher = account.convert(conversion(2));

    expect(voucher.valueCents).toBe(1_000);
    expect(voucher.pointsCost).toBe(2_000);
    expect(account.balance).toBe(340);
    expect(account.pendingEntries).toEqual([
      expect.objectContaining({
        kind: "converted",
        points: -2_000,
        voucherId: "v1",
        actorUserId: "u1",
      }),
    ]);
  });

  it("peut vider le solde à zéro, jamais en dessous", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 2_000);
    account.convert(conversion(2));
    expect(account.balance).toBe(0);
    expect(() => account.convert(conversion(1))).toThrow(InsufficientLoyaltyPointsError);
  });

  it("refuse un solde qui ne couvre pas le palier, et n'écrit rien", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 999);
    expect(() => account.convert(conversion(1))).toThrow(InsufficientLoyaltyPointsError);
    expect(account.pendingEntries).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "refuse %p palier(s) : on convertit par paliers entiers",
    (steps) => {
      const account = LoyaltyAccount.reconstitute(PERSON, 10_000);
      expect(() => account.convert(conversion(steps))).toThrow(InvalidStepCountError);
    },
  );

  it("refuse tant qu'aucun réglage n'est posé : le programme est fermé", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 10_000);
    expect(() => account.convert(conversion(1, null))).toThrow(LoyaltyProgramClosedError);
  });

  it("refuse une société tant que la clientèle pro est fermée", () => {
    const account = LoyaltyAccount.reconstitute(COMPANY, 10_000);
    expect(() => account.convert(conversion(1))).toThrow(LoyaltyProgramClosedToClienteleError);
  });

  it("convertit quand le solde attendu est celui du livre", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 2_340);
    account.convert(conversion(1, SETTINGS, 2_340));
    expect(account.balance).toBe(1_340);
  });

  it("refuse un solde attendu qui n'est plus celui du livre — le second clic — et n'écrit rien", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 1_340);
    expect(() => account.convert(conversion(1, SETTINGS, 2_340))).toThrow(
      LoyaltyBalanceChangedError,
    );
    expect(account.pendingEntries).toEqual([]);
  });

  it("refuse un solde attendu différent même quand le solde réel couvrirait le bon", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 5_000);
    expect(() => account.convert(conversion(1, SETTINGS, 4_000))).toThrow(
      LoyaltyBalanceChangedError,
    );
  });
});

describe("LoyaltyAccount.adjust — un geste motivé du staff", () => {
  it("ajoute ou retire des points, avec son auteur et son motif", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 100);
    account.adjust(-100, act);
    expect(account.balance).toBe(0);
    expect(account.pendingEntries[0]).toMatchObject({
      kind: "adjusted",
      points: -100,
      staffUserId: "staff_1",
      reason: "geste",
      voucherId: null,
    });
  });

  it("refuse un retrait qui passerait le solde sous zéro", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 100);
    expect(() => account.adjust(-101, act)).toThrow(LoyaltyBalanceBelowZeroError);
  });

  it("refuse zéro point", () => {
    expect(() => LoyaltyAccount.reconstitute(PERSON, 0).adjust(0, act)).toThrow(
      EmptyAdjustmentError,
    );
  });
});

describe("LoyaltyAccount.recreditCancelled — l'annulation rend les points", () => {
  it("recrédite le coût d'un bon annulé, par une ligne liée au bon", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 3_000);
    const voucher = account.convert(conversion(3));
    const reloaded = LoyaltyAccount.reconstitute(PERSON, 0);
    voucher.cancel(AT, "staff_1", LoyaltyReason.of("erreur de conversion"));

    reloaded.recreditCancelled(voucher, act);

    expect(reloaded.balance).toBe(3_000);
    expect(reloaded.pendingEntries[0]).toMatchObject({
      kind: "adjusted",
      points: 3_000,
      voucherId: "v1",
    });
  });

  it("refuse un bon qui n'est pas annulé", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 3_000);
    const voucher = account.convert(conversion(1));
    expect(() => account.recreditCancelled(voucher, act)).toThrow(LoyaltyVoucherNotAvailableError);
  });

  it("refuse le bon d'un autre titulaire", () => {
    const voucher = LoyaltyAccount.reconstitute(PERSON, 3_000).convert(conversion(1));
    voucher.cancel(AT, "staff_1", LoyaltyReason.of("erreur"));
    const other = LoyaltyAccount.reconstitute(LoyaltyHolder.of("user", "u2"), 0);
    expect(() => other.recreditCancelled(voucher, act)).toThrow(LoyaltyVoucherNotAvailableError);
  });
});

describe("LoyaltyAccount.earn — le gain d'une commande définitive", () => {
  it("ajoute une ligne `earned` liée à la commande, et le solde suit", () => {
    const account = LoyaltyAccount.reconstitute(PERSON, 100);
    account.earn({ entryId: "e3", orderId: "o1", points: 2_340, at: AT });

    expect(account.balance).toBe(2_440);
    expect(account.pendingEntries).toEqual([
      {
        id: "e3",
        holder: PERSON,
        kind: "earned",
        points: 2_340,
        orderId: "o1",
        voucherId: null,
        occurredAt: AT,
        actorUserId: null,
        staffUserId: null,
        reason: null,
      },
    ]);
  });

  it.each([0, -5, 1.5])("refuse un gain de %p points, et n'écrit rien", (points) => {
    const account = LoyaltyAccount.reconstitute(PERSON, 0);
    expect(() => account.earn({ entryId: "e3", orderId: "o1", points, at: AT })).toThrow(
      InvalidEarnedPointsError,
    );
    expect(account.pendingEntries).toEqual([]);
  });
});
