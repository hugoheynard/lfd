/**
 * Les niveaux du catalogue à leur défaut, pour les suites qui posent une
 * réponse du serveur sans passer par le réseau.
 *
 * Il ne reste que le mandat client, FERMÉ : `shop`, `orders`, `invoices`,
 * `desktopMenu` et `publicDelivery` ont été retirées le 2026-10-09.
 */
export const DEFAULT_LEVELS = {
  customerMandate: 'closed',
} as const;
