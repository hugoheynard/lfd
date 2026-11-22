/**
 * **Le registre des origines des liens de paiement** — sa moitié écrite dans
 * le dépôt (doc
 * `documentation/payment/les-liens-de-paiement.md`), à la manière de `CARD_ACCOUNTS`.
 *
 * Une origine est l'application qui demande un lien : son nom (persisté sur
 * chaque lien, `payment.pay_link.origin`), son libellé, et la racine
 * publique où sa page `/payer/<jeton>` est montée. La racine n'est pas écrite
 * ici : elle nomme l'une des racines que `AppConfig` lit dans
 * l'environnement. Une origine hors de cette liste est refusée à l'ouverture.
 */

/** Les racines publiques que `AppConfig` sait lire. `client` : `CLIENT_BASE_URL`. */
export type PayLinkPublicRoot = "client";

/** Une entrée du registre. */
export interface PayLinkOriginDeclaration {
  /** Le nom persisté — 🔴 une valeur écrite en base, qui ne se renomme pas. */
  readonly name: string;
  /** Comment l'équipe et le payeur la lisent. */
  readonly label: string;
  readonly publicRoot: PayLinkPublicRoot;
}

/** Les origines déclarées. */
export const PAY_LINK_ORIGINS: readonly PayLinkOriginDeclaration[] = [
  { name: "lafoliecoffee", label: "La Folie Coffee", publicRoot: "client" },
];

/** Une origine, sa racine résolue : `null` quand l'environnement ne la pose pas. */
export interface PayLinkOrigin {
  readonly name: string;
  readonly label: string;
  readonly publicRoot: string | null;
}
