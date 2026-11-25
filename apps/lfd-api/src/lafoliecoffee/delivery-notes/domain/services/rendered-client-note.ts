import type { ClientNote } from "@lfd/contracts";

import type { UndeliveredLine } from "./undelivered-lines.js";

/**
 * **L'entrée complète du rendu du BL client** : le BL chiffré composé — en-tête
 * et facturation lus sur la commande, parts par remise, lignes du bon — et ce
 * que la commande attend encore, calculé sur TOUS les bons frères. Le PDF se
 * rend d'elle seule (avec le logo, qui n'est pas du contenu).
 *
 * C'est elle qu'une version du bon fige (`documentation/commandes/reliquat/reliquat.md`, § 7) : figer
 * « en-tête et lignes » rendrait un document recalculé qui ne correspond à
 * aucun papier sorti.
 */
export interface RenderedClientNote {
  readonly note: ClientNote;
  readonly undelivered: readonly UndeliveredLine[];
}
