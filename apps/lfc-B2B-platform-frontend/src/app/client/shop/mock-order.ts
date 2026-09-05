/**
 * Le numéro de commande de la maquette.
 *
 * ⚠️ **Le dernier reliquat de démonstration du parcours de commande.** Les
 * commandes du client ne sont pas encore passées au serveur — elles vivent dans
 * le navigateur — et il leur faut bien un numéro. Le jour où `POST /orders` sert
 * ce parcours, c'est le serveur qui le donne et ce fichier disparaît.
 *
 * Il est ISOLÉ plutôt que laissé dans le catalogue de maquette : ce dernier est
 * mort avec l'hydratation, et garder une constante de démonstration dedans
 * aurait fait survivre le fichier pour une ligne.
 */
export const MOCK_ORDER_REF = '4822';
