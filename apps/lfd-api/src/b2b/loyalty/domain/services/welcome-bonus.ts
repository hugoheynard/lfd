import { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

/** Une personne vue par le bonus de bienvenue — rien d'autre que ce que la règle lit. */
export interface WelcomeCandidate {
  readonly userId: string;
  /** L'instant où la fiche est devenue un compte — `null` pour un invité. */
  readonly becameAccountAt: Date | null;
  /** `users.email_verified` : une connexion a prouvé l'adresse en base (§7 S9). */
  readonly addressProven: boolean;
  /** Sa ligne `welcome` existe déjà. */
  readonly alreadyWelcomed: boolean;
}

/** Pourquoi une personne ne reçoit pas le bonus. */
export type WelcomeSkipReason =
  | "program_closed"
  | "clientele_closed"
  | "bonus_off"
  | "not_an_account"
  | "before_bonus"
  | "address_unproven"
  | "already_welcomed";

export type WelcomeBonus =
  | { readonly kind: "welcome"; readonly holder: LoyaltyHolder; readonly points: number }
  | { readonly kind: "skip"; readonly reason: WelcomeSkipReason };

/**
 * **Le bonus de bienvenue est-il dû à cette personne, et combien ?** (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * R2 corrigé par son §7 — B3, S8, S9). Il faut les quatre :
 *
 * - un réglage, ouvert au public, avec un bonus (`welcome_bonus_points`) et
 *   l'instant où il a été allumé (`welcome_bonus_since`) ;
 * - la personne est devenue un compte À OU APRÈS cet instant — un compte
 *   devenu tel bonus éteint n'en reçoit pas quand on l'allume ;
 * - son adresse est prouvée en base ;
 * - elle n'a pas encore sa ligne `welcome`.
 *
 * Le titulaire est toujours la personne (B3) : le bonus sert à ses commandes
 * de particulier, quelle que soit la société qu'elle rejoint. Le montant est
 * celui du réglage AU MOMENT du crédit — le bonus déjà écrit n'est jamais
 * relu. Un réglage qui porte un montant sans `welcome_bonus_since` (réhydraté
 * hors de `LoyaltySettings.configure`) n'a pas de borne : rien n'est dû.
 */
export function welcomeBonusFor(
  candidate: WelcomeCandidate,
  settings: LoyaltySettings | null,
): WelcomeBonus {
  if (settings === null) {
    return skip("program_closed");
  }
  if (!settings.openToPublic) {
    return skip("clientele_closed");
  }
  const points = settings.welcomeBonusPoints;
  const since = settings.welcomeBonusSince;
  if (points === null || since === null) {
    return skip("bonus_off");
  }
  if (candidate.becameAccountAt === null) {
    return skip("not_an_account");
  }
  if (candidate.becameAccountAt.getTime() < since.getTime()) {
    return skip("before_bonus");
  }
  if (!candidate.addressProven) {
    return skip("address_unproven");
  }
  if (candidate.alreadyWelcomed) {
    return skip("already_welcomed");
  }
  return { kind: "welcome", holder: LoyaltyHolder.of("user", candidate.userId), points };
}

function skip(reason: WelcomeSkipReason): WelcomeBonus {
  return { kind: "skip", reason };
}
