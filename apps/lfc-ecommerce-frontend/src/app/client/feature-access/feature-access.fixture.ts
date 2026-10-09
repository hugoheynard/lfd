/**
 * Les niveaux du catalogue à leur défaut, pour les suites qui posent une
 * réponse du serveur sans passer par le réseau.
 *
 * Le mandat client, FERMÉ, et la connexion par Facebook, MASQUÉE : `shop`,
 * `orders`, `invoices`, `desktopMenu` et `publicDelivery` ont été retirées le
 * 2026-10-09.
 */
export const DEFAULT_LEVELS = {
  customerMandate: 'closed',
  facebookLogin: 'hidden',
} as const;
