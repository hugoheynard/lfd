/**
 * Le client reconnu de la maquette.
 *
 * ⚠️ Ces six faits viendront du compte. Ils sont rassemblés ici, et pas
 * disséminés dans les écrans, pour que le jour où le compte arrive il n'y ait
 * qu'un endroit à débrancher.
 */
export const MOCK_CLIENT = {
  firstName: 'Pierre',
  phone: '06 12 44 09 87',
  /** L'adresse du compte — celle que la confirmation NOMME, pour qu'on la corrige. */
  email: 'pierre@chalet-barmettes.fr',
  /** Les notifications non lues, que la cloche annonce. */
  unread: 5,
  /** Les factures qui attendent un règlement — le seul compteur du menu qui
   *  n'ait pas encore de modèle derrière lui. */
  invoicesDue: 1,
  /** Les gabarits de panier récurrent — le compteur de la quatrième destination. */
  recurringBaskets: 2,
} as const;
