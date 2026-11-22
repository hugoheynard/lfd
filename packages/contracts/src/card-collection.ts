/**
 * **Comment la page fait payer le client par carte** — une instruction neutre
 * du prestataire, rendue par le serveur à chaque écran qui encaisse (doc
 * `documentation/payment/les-liens-de-paiement.md`). La boutique la lit par un seul composant de collecte ; seul ce
 * composant sait ce qu'est un prestataire.
 *
 * - `embedded` — le formulaire du prestataire, monté dans notre page avec sa
 *   clé **publique** et un jeton propre à ce paiement (pour Stripe : le
 *   Payment Element, la `pk_…` et le `client_secret` de la PaymentIntent) ;
 * - `redirect` — la page du prestataire, où l'on envoie le client.
 *
 * Le résultat n'arrive jamais par la page : toujours par le webhook du compte
 * qui encaisse. Des types seulement, rien qui s'exécute.
 */
export type CardCollection = EmbeddedCardCollection | RedirectCardCollection;

/** Le formulaire du prestataire, dans notre page. */
export interface EmbeddedCardCollection {
  readonly kind: "embedded";
  /** Le prestataire qui fournit le formulaire (`stripe`). */
  readonly provider: string;
  /** Sa clé publique — non secrète, faite pour le navigateur. */
  readonly publishableKey: string;
  /** Le jeton de CE paiement, qui monte le formulaire. */
  readonly token: string;
}

/** La page du prestataire, où l'on envoie le client. */
export interface RedirectCardCollection {
  readonly kind: "redirect";
  readonly provider: string;
  readonly url: string;
}
