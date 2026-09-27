import {
  InvalidLoyaltyHolderError,
  InvalidLoyaltyRatioError,
  InvalidLoyaltyReasonError,
  InvalidVoucherValidityError,
} from "../../errors/loyalty-errors.js";
import { LoyaltyHolder } from "../loyalty-holder.js";
import { LoyaltyRatio } from "../loyalty-ratio.js";
import { LoyaltyReason } from "../loyalty-reason.js";
import { LoyaltySettings } from "../loyalty-settings.js";

const SETTINGS = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

describe("LoyaltyRatio — des entiers, toujours", () => {
  it("compte le coût et la valeur de paliers entiers, sans division", () => {
    const ratio = LoyaltyRatio.of(1_000, 500);
    expect(ratio.costOf(3)).toBe(3_000);
    expect(ratio.valueOf(3)).toBe(1_500);
  });

  it.each([
    [0, 500],
    [1_000, 0],
    [-1, 500],
    [1_000.5, 500],
    [1_000, 4.99],
    [Number.NaN, 500],
  ])("refuse %p points pour %p centimes", (points, cents) => {
    expect(() => LoyaltyRatio.of(points, cents)).toThrow(InvalidLoyaltyRatioError);
  });
});

describe("LoyaltyRatio.stepsCoveredBy — ce que l'écran propose de convertir", () => {
  const ratio = LoyaltyRatio.of(1_000, 500);

  it.each([
    [2_340, 2],
    [2_000, 2],
    [999, 0],
    [0, 0],
    [-50, 0],
  ])("un solde de %p points couvre %p palier(s)", (balance, steps) => {
    expect(ratio.stepsCoveredBy(balance)).toBe(steps);
  });
});

describe("LoyaltyHolder — la société OU la personne", () => {
  it("préfixe la clé de verrou : une société et une personne de même id ne se croisent pas", () => {
    const company = LoyaltyHolder.of("company", "abc");
    const user = LoyaltyHolder.of("user", "abc");
    expect(company.lockKey).toBe("company:abc");
    expect(user.lockKey).toBe("user:abc");
    expect(company.equals(user)).toBe(false);
  });

  it("ne pose que la colonne de son genre", () => {
    const company = LoyaltyHolder.of("company", "c1");
    expect([company.companyId, company.userId]).toEqual(["c1", null]);
    const user = LoyaltyHolder.of("user", "u1");
    expect([user.companyId, user.userId]).toEqual([null, "u1"]);
  });

  it("se relit depuis les colonnes, et refuse une ligne sans titulaire", () => {
    expect(LoyaltyHolder.fromColumns(null, "u1").kind).toBe("user");
    expect(LoyaltyHolder.fromColumns("c1", null).kind).toBe("company");
    expect(() => LoyaltyHolder.fromColumns(null, null)).toThrow(InvalidLoyaltyHolderError);
  });

  it("refuse un identifiant vide", () => {
    expect(() => LoyaltyHolder.of("user", "  ")).toThrow(InvalidLoyaltyHolderError);
  });
});

describe("LoyaltySettings — le réglage du programme", () => {
  it("ouvre la clientèle publique aux personnes, la clientèle pro aux sociétés", () => {
    const settings = LoyaltySettings.of(SETTINGS);
    expect(settings.isOpenTo(LoyaltyHolder.of("user", "u1"))).toBe(true);
    expect(settings.isOpenTo(LoyaltyHolder.of("company", "c1"))).toBe(false);
  });

  it("refuse une validité nulle ou fractionnaire", () => {
    expect(() => LoyaltySettings.of({ ...SETTINGS, voucherValidityDays: 0 })).toThrow(
      InvalidVoucherValidityError,
    );
    expect(() => LoyaltySettings.of({ ...SETTINGS, voucherValidityDays: 1.5 })).toThrow(
      InvalidVoucherValidityError,
    );
  });

  it("se compare champ à champ", () => {
    const settings = LoyaltySettings.of(SETTINGS);
    expect(settings.equals(LoyaltySettings.of(SETTINGS))).toBe(true);
    expect(settings.equals(LoyaltySettings.of({ ...SETTINGS, openToPro: true }))).toBe(false);
    expect(settings.toInput()).toEqual(SETTINGS);
  });
});

describe("LoyaltyReason — un motif obligatoire", () => {
  it("rogne le motif", () => {
    expect(LoyaltyReason.of("  geste commercial ").text).toBe("geste commercial");
  });

  it("refuse un motif vide ou trop long", () => {
    expect(() => LoyaltyReason.of("   ")).toThrow(InvalidLoyaltyReasonError);
    expect(() => LoyaltyReason.of("x".repeat(501))).toThrow(InvalidLoyaltyReasonError);
  });
});
