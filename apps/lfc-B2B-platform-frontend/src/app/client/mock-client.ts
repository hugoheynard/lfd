/**
 * Le client reconnu de la maquette.
 *
 * ⚠️ Ces trois faits viendront du compte. Ils sont rassemblés ici, et pas
 * disséminés dans les écrans, pour que le jour où le compte arrive il n'y ait
 * qu'un endroit à débrancher.
 */
export const MOCK_CLIENT = {
  firstName: 'Pierre',
  phone: '06 12 44 09 87',
  /** La commande prête à retirer, celle que l'écran d'accueil rappelle. */
  lastOrder: '#4821',
  /** Les notifications non lues, que la cloche annonce. */
  unread: 5,
} as const;
