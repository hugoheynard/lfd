import type { AccessOutcome } from "../../domain/value-objects/access-outcome.js";
import type { AccessToGrant } from "./grant-account-access.service.js";

/**
 * Un accès ouvert dont l'e-mail n'est pas encore parti.
 *
 * `announce` envoie l'e-mail d'ouverture et rend `true` s'il est vraiment
 * parti ; il ne lève jamais (un canal absent ne défait pas l'accès).
 */
export interface AccessOpening {
  readonly userId: string;
  /** Reste au serveur, comme dans `AccessGranted`. */
  readonly outcome: AccessOutcome;
  readonly announce: () => Promise<boolean>;
}

/**
 * Port d'ouverture d'accès **en deux temps** : l'identité et le rattachement
 * d'abord, l'e-mail quand l'appelant le décide.
 *
 * Distinct d'`AccountAccessGranter` (ISP) : seul un geste qui doit encore
 * enregistrer quelque chose après l'ouverture en a besoin — le rattachement
 * du détenteur (plan `plan-service-e-mails.md`, revue, cas 9), dont l'e-mail
 * ne part qu'après la validation de la société.
 */
export abstract class AccountAccessOpener {
  abstract open(input: AccessToGrant): Promise<AccessOpening>;
}
