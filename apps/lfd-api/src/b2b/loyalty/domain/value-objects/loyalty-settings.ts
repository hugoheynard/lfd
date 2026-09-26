import { InvalidVoucherValidityError } from "../errors/loyalty-errors.js";
import type { LoyaltyHolder } from "./loyalty-holder.js";
import { isPositiveInteger, LoyaltyRatio } from "./loyalty-ratio.js";

/** Ce qu'on pose d'un coup à l'écran — aucune valeur n'a de défaut (plan D5). */
export interface LoyaltySettingsInput {
  readonly pointsPerStep: number;
  readonly stepValueCents: number;
  readonly openToPublic: boolean;
  readonly openToPro: boolean;
  readonly voucherValidityDays: number;
}

/**
 * **Le réglage du programme** — lu à la conversion, figé sur le bon.
 *
 * Un value object et non un agrégat : une ligne sans transition, que seule sa
 * forme peut refuser (`CLAUDE.md` §3.1). Son absence, elle, a un sens : le
 * programme est fermé — c'est `LoyaltyAccount.convert` qui le refuse.
 */
export class LoyaltySettings {
  private constructor(
    readonly ratio: LoyaltyRatio,
    readonly openToPublic: boolean,
    readonly openToPro: boolean,
    readonly voucherValidityDays: number,
  ) {}

  /**
   * @throws {InvalidLoyaltyRatioError} ratio non entier ou non positif.
   * @throws {InvalidVoucherValidityError} durée non entière ou non positive.
   */
  static of(input: LoyaltySettingsInput): LoyaltySettings {
    const ratio = LoyaltyRatio.of(input.pointsPerStep, input.stepValueCents);
    if (!isPositiveInteger(input.voucherValidityDays)) {
      throw new InvalidVoucherValidityError(input.voucherValidityDays);
    }
    return new LoyaltySettings(
      ratio,
      input.openToPublic,
      input.openToPro,
      input.voucherValidityDays,
    );
  }

  /** La société relève de la clientèle pro, la personne de la clientèle publique. */
  isOpenTo(holder: LoyaltyHolder): boolean {
    return holder.kind === "company" ? this.openToPro : this.openToPublic;
  }

  toInput(): LoyaltySettingsInput {
    return {
      pointsPerStep: this.ratio.pointsPerStep,
      stepValueCents: this.ratio.stepValueCents,
      openToPublic: this.openToPublic,
      openToPro: this.openToPro,
      voucherValidityDays: this.voucherValidityDays,
    };
  }

  equals(other: LoyaltySettings): boolean {
    const a = this.toInput();
    const b = other.toInput();
    return (Object.keys(a) as (keyof LoyaltySettingsInput)[]).every((key) => a[key] === b[key]);
  }
}
