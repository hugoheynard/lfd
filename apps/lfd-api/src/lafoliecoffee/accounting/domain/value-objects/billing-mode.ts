import {
  BillingRhythm,
  DEFAULT_MONTHLY_CLOSING_DAY,
  DEFAULT_SEMIMONTHLY_CLOSING_DAYS,
  DEFAULT_WEEKLY_CLOSING_WEEKDAY,
  type BillingRhythmKind,
} from "./billing-rhythm.js";
import { InvalidBillingRhythmError } from "../errors/billing-rhythm-errors.js";

/**
 * **Un mode de facturation** — mensuel, deux fois par mois, hebdomadaire (plan
 * `plan-rythme-de-facturation.md`, §16). Le même ensemble que le genre d'un
 * rythme : l'entité fixe les dates de chaque mode, le payeur en choisit un.
 */
export type BillingMode = BillingRhythmKind;

/** Les trois modes, dans l'ordre où l'écran les dit. */
export const BILLING_MODES: readonly BillingMode[] = ["monthly", "semimonthly", "weekly"];

/** Le mode d'un payeur qui n'a rien choisi (Hugo, 2026-10-12 : « mensuel par défaut »). */
export const DEFAULT_BILLING_MODE: BillingMode = "monthly";

/** Le mode tel que la comptabilité le lit dans un refus. */
export const BILLING_MODE_LABELS: Readonly<Record<BillingMode, string>> = {
  monthly: "mensuel",
  semimonthly: "deux fois par mois",
  weekly: "hebdomadaire",
};

/**
 * Les dates d'un mode que l'entité n'a jamais réglé : le 1er, le 1er et le
 * 16, le lundi. Un mode sans ligne en base les porte — aucune n'est semée.
 */
export function defaultDatesOf(mode: BillingMode): BillingRhythm {
  if (mode === "semimonthly") {
    const [first, second] = DEFAULT_SEMIMONTHLY_CLOSING_DAYS;
    return BillingRhythm.semimonthly(first, second);
  }
  if (mode === "weekly") {
    return BillingRhythm.weekly(DEFAULT_WEEKLY_CLOSING_WEEKDAY);
  }
  return BillingRhythm.monthly(DEFAULT_MONTHLY_CLOSING_DAY);
}

/**
 * Relit un mode persisté ou reçu : une valeur inconnue est refusée, jamais
 * prise pour le mensuel.
 *
 * @throws {InvalidBillingRhythmError} le mode n'est pas l'un des trois.
 */
export function billingModeOf(raw: string): BillingMode {
  const mode = BILLING_MODES.find((known) => known === raw);
  if (mode === undefined) {
    throw new InvalidBillingRhythmError(
      `mode « ${raw} » inconnu : attendu mensuel (monthly), deux fois par mois ` +
        `(semimonthly) ou hebdomadaire (weekly).`,
    );
  }
  return mode;
}
