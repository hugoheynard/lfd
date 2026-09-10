/**
 * Le cycle en cours.
 *
 * Une **lecture** : elle ne clôture rien et n'écrit rien. Clôturer est un fait
 * qu'on garde, donc ce sera une commande — et le jour où les clôtures seront
 * enregistrées, c'est le handler qui les lira, pas cette classe qui changera.
 */
export class GetCurrentBillingCycleQuery {}
