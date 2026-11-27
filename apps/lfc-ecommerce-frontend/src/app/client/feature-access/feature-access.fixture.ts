/**
 * Les niveaux du catalogue à leur défaut, pour les suites qui posent une
 * réponse du serveur sans passer par le réseau.
 *
 * Le mandat client et le planificateur FERMÉS, la connexion par Facebook et le
 * rappel MASQUÉS : `shop`,
 * `orders`, `invoices`, `desktopMenu` et `publicDelivery` ont été retirées le
 * 2026-10-09.
 */
export const DEFAULT_LEVELS = {
  customerMandate: 'closed',
  facebookLogin: 'hidden',
  proSignupCallback: 'hidden',
  orderPlanner: 'closed',
} as const;
