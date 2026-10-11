import { InvalidVoucherValidityError, InvalidWelcomeBonusError } from "../errors/loyalty-errors.js";
import type { LoyaltyHolder } from "./loyalty-holder.js";
import { isPositiveInteger, LoyaltyRatio } from "./loyalty-ratio.js";

/** Ce qu'on pose d'un coup à l'écran — aucune valeur n'a de défaut (plan D5). */
export interface LoyaltySettingsInput {
  readonly pointsPerStep: number;
  readonly stepValueCents: number;
  readonly openToPublic: boolean;
  readonly openToPro: boolean;
  readonly voucherValidityDays: number;
  /**
   * Les points offerts à qui devient un compte — `null` = aucun bonus. Absent
   * se lit `null` : un réglage d'avant le bonus n'en offrait pas.
   */
  readonly welcomeBonusPoints?: number | null | undefined;
}

/** Les valeurs saisies telles que le réglage les rend : le bonus absent y est `null`. */
export type LoyaltySettingsValues = Omit<LoyaltySettingsInput, "welcomeBonusPoints"> & {
  readonly welcomeBonusPoints: number | null;
};

/**
 * Les instants que le réglage **déduit** de son histoire, jamais saisis
 * (plan bienvenue, §7 S2 et S8). Ils ne participent pas à l'égalité : ils ne
 * changent que lorsqu'une valeur saisie change.
 */
export interface LoyaltySettingsMilestones {
  /** Première ouverture au public — posée une fois, jamais effacée (R4). */
  readonly publicOpenedAt: Date | null;
  /** Dernier passage du bonus de « aucun » à un nombre. */
  readonly welcomeBonusSince: Date | null;
}

const NO_MILESTONES: LoyaltySettingsMilestones = { publicOpenedAt: null, welcomeBonusSince: null };

/**
 * **Le réglage du programme** — lu à la conversion, figé sur le bon.
 *
 * Un value object et non un agrégat : une ligne que seule sa forme peut
 * refuser (`CLAUDE.md` §3.1). Ses deux jalons sont dérivés par
 * {@link LoyaltySettings.configure}, le seul chemin du geste comptable. Son
 * absence, elle, a un sens : le programme est fermé — c'est
 * `LoyaltyAccount.convert` qui le refuse.
 */
export class LoyaltySettings {
  private constructor(
    readonly ratio: LoyaltyRatio,
    readonly openToPublic: boolean,
    readonly openToPro: boolean,
    readonly voucherValidityDays: number,
    readonly welcomeBonusPoints: number | null,
    readonly milestones: LoyaltySettingsMilestones,
  ) {}

  /**
   * Réhydrate un réglage, jalons compris.
   *
   * @throws {InvalidLoyaltyRatioError} ratio non entier ou non positif.
   * @throws {InvalidVoucherValidityError} durée non entière ou non positive.
   * @throws {InvalidWelcomeBonusError} bonus non entier ou non positif.
   */
  static of(
    input: LoyaltySettingsInput,
    milestones: LoyaltySettingsMilestones = NO_MILESTONES,
  ): LoyaltySettings {
    const ratio = LoyaltyRatio.of(input.pointsPerStep, input.stepValueCents);
    if (!isPositiveInteger(input.voucherValidityDays)) {
      throw new InvalidVoucherValidityError(input.voucherValidityDays);
    }
    const bonus = input.welcomeBonusPoints ?? null;
    if (bonus !== null && !isPositiveInteger(bonus)) {
      throw new InvalidWelcomeBonusError(bonus);
    }
    return new LoyaltySettings(
      ratio,
      input.openToPublic,
      input.openToPro,
      input.voucherValidityDays,
      bonus,
      milestones,
    );
  }

  /**
   * **Le réglage que pose le comptable à `at`**, à la suite de `previous`
   * (`null` = premier enregistrement). Les jalons en découlent :
   *
   * - `publicOpenedAt` est posé à la première ouverture au public et n'est
   *   plus jamais effacé ni déplacé — fermer puis rouvrir ne le change pas ;
   * - `welcomeBonusSince` est posé chaque fois que le bonus passe de « aucun »
   *   à un nombre ; changer un montant déjà actif, ou l'éteindre, le garde.
   */
  static configure(
    previous: LoyaltySettings | null,
    input: LoyaltySettingsInput,
    at: Date,
  ): LoyaltySettings {
    const next = LoyaltySettings.of(input);
    const before = previous?.milestones ?? NO_MILESTONES;
    const bonusTurnsOn =
      next.welcomeBonusPoints !== null && (previous?.welcomeBonusPoints ?? null) === null;
    return LoyaltySettings.of(input, {
      publicOpenedAt: before.publicOpenedAt ?? (next.openToPublic ? at : null),
      welcomeBonusSince: bonusTurnsOn ? at : before.welcomeBonusSince,
    });
  }

  get publicOpenedAt(): Date | null {
    return this.milestones.publicOpenedAt;
  }

  get welcomeBonusSince(): Date | null {
    return this.milestones.welcomeBonusSince;
  }

  /** La société relève de la clientèle pro, la personne de la clientèle publique. */
  isOpenTo(holder: LoyaltyHolder): boolean {
    return holder.kind === "company" ? this.openToPro : this.openToPublic;
  }

  /**
   * Une commande publique passée à `placedAt` l'a-t-elle été avant que le
   * programme soit ouvert au public (R4) ? Sans jalon — un réglage réhydraté
   * hors de {@link configure}, en test —, rien n'est antérieur.
   */
  isBeforePublicOpening(placedAt: Date): boolean {
    const openedAt = this.milestones.publicOpenedAt;
    return openedAt !== null && placedAt.getTime() < openedAt.getTime();
  }

  toInput(): LoyaltySettingsValues {
    return {
      pointsPerStep: this.ratio.pointsPerStep,
      stepValueCents: this.ratio.stepValueCents,
      openToPublic: this.openToPublic,
      openToPro: this.openToPro,
      voucherValidityDays: this.voucherValidityDays,
      welcomeBonusPoints: this.welcomeBonusPoints,
    };
  }

  /** L'égalité des valeurs SAISIES — les jalons en découlent. */
  equals(other: LoyaltySettings): boolean {
    const a = this.toInput();
    const b = other.toInput();
    return (Object.keys(a) as (keyof LoyaltySettingsValues)[]).every((key) => a[key] === b[key]);
  }
}
