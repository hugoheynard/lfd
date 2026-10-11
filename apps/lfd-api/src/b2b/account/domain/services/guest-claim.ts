import { signInRouteOfSubject, type SignInRoute } from "../value-objects/sign-in-route.js";

/**
 * **Les connexions dont la preuve d'adresse est établie** — les seules qui
 * rattachent une fiche invité (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * R1 et §7 S6).
 *
 * - `email_code` : la connexion par code (`email|…`) — le code a été reçu dans
 *   la boîte, c'est la preuve même ;
 * - `google` (`google-oauth2|…`) : Google atteste l'adresse de son compte.
 *
 * Exclues : `password` (`auth0|…`), dont `email_verified` peut être vrai sans
 * que la personne qui tape ait jamais eu la boîte entre les mains au moment de
 * l'inscription, et `facebook`, dont l'attestation d'adresse n'est pas établie.
 * Tout fournisseur inconnu (`other`) est exclu par construction.
 */
export const GUEST_CLAIM_ROUTES: ReadonlySet<SignInRoute> = new Set<SignInRoute>([
  "email_code",
  "google",
]);

/** Ce que la règle lit d'une première entrée : rien d'autre que ces trois faits. */
export interface GuestClaimant {
  /** Le `sub` du jeton — son préfixe désigne la connexion. */
  readonly subject: string;
  /** L'adresse portée par le jeton, telle quelle. */
  readonly email: string;
  /** Le jeton prouve-t-il CETTE adresse (`email_verified` et même adresse) ? */
  readonly addressProven: boolean;
}

/**
 * **Cette première entrée peut-elle prendre possession d'une fiche invité ?**
 *
 * Il faut les trois : une adresse non vide, prouvée par le jeton, et une
 * connexion de {@link GUEST_CLAIM_ROUTES}. C'est toute la sécurité du geste :
 * qui prouve la boîte hérite de ce qui a été commandé sous elle (R3, assumé).
 *
 * ⚠️ Ici, le préfixe du `sub` DÉCIDE d'un accès — à la différence de
 * {@link signInRouteOfSubject} partout ailleurs, qui ne sert qu'à parler.
 */
export function mayClaimGuestFile(claimant: GuestClaimant): boolean {
  return (
    claimant.email.trim() !== "" &&
    claimant.addressProven &&
    GUEST_CLAIM_ROUTES.has(signInRouteOfSubject(claimant.subject))
  );
}

/**
 * La fiche invité à rattacher : **exactement une**, sinon aucune. Plusieurs
 * fiches à la même adresse (créées avant D8) ne désignent personne — la
 * première entrée ouvre alors un compte neuf (R5).
 */
export function soleGuestFile<T>(guests: readonly T[]): T | null {
  const [only] = guests;
  return guests.length === 1 && only !== undefined ? only : null;
}
