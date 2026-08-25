import { AddressKind } from "../../../platform/database/client/client.js";

/**
 * **Le seul endroit qui sait qu'une adresse a deux encodages.**
 *
 * `addresses.kind` porte aujourd'hui quatre valeurs pour deux sens :
 * `facturation`/`livraison` (historiques, encore écrites) et
 * `billing`/`delivery` (cibles, déjà lues). C'est le palier « étendre » de la
 * bascule décrite dans `documentation/langue-du-code.md` §4 quater.
 *
 * ## Pourquoi un module plutôt qu'un `in: [...]` sur place
 *
 * Les lectures de ce `kind` sont éparpillées sur cinq fichiers et deux
 * contextes (`account`, `growth`), et trois d'entre elles filtraient sur la
 * **chaîne** `"facturation"`. Une chaîne ne se renomme pas toute seule et
 * aucun gate ne la compte : au palier 2, chacune serait devenue un filtre qui
 * ne trouve plus rien — pas une erreur, une adresse qui disparaît. Les
 * rassembler ici rend la bascule visible en un seul fichier, et son retrait
 * mécanique.
 *
 * ## Ce qui se passe aux paliers suivants
 *
 * - ~~**Palier 2 (basculer)**~~ ✅ : `WRITE_*` écrit les nouvelles valeurs et
 *   une migration a réécrit les lignes. Les deux listes n'ont PAS bougé, et
 *   c'est le point : l'ancien container a continué d'écrire `facturation`
 *   pendant la fenêtre de déploiement, et ces lignes-là se lisent encore.
 * - **Palier 3 (resserrer)** : ce fichier **disparaît**, l'enum retombe à deux
 *   valeurs, et les appelants reviennent à `AddressKind.billing` /
 *   `AddressKind.delivery` en clair. Sa migration refuse de partir tant qu'une
 *   ligne porte encore l'ancien encodage.
 */

/** Les encodages qui signifient « adresse de facturation ». */
const BILLING: readonly AddressKind[] = [AddressKind.facturation, AddressKind.billing];

/** Les encodages qui signifient « adresse de livraison ». */
const DELIVERY: readonly AddressKind[] = [AddressKind.livraison, AddressKind.delivery];

/**
 * Les deux encodages de la facturation, pour un `where: { kind: { in: ... } }`.
 *
 * Une FONCTION, et une copie : Prisma veut un tableau mutable, et rendre la
 * constante mutable pour lui faire plaisir exposerait la liste à être modifiée
 * par un appelant. Le tableau source reste `readonly`, chaque appel en rend une
 * copie.
 */
export function billingKinds(): AddressKind[] {
  return [...BILLING];
}

/** Idem pour la livraison — cf. {@link billingKinds}. */
export function deliveryKinds(): AddressKind[] {
  return [...DELIVERY];
}

/**
 * Ce qu'on ÉCRIT — le nouvel encodage depuis le palier 2. Le retour arrière
 * reste possible : la version du palier 1 lisait déjà les deux, donc elle
 * relirait sans broncher ce que celle-ci a écrit.
 */
export const WRITE_BILLING: AddressKind = AddressKind.billing;

/** Idem pour la livraison — cf. {@link WRITE_BILLING}. */
export const WRITE_DELIVERY: AddressKind = AddressKind.delivery;

/** Cette ligne est-elle une facturation, quel que soit son encodage ? */
export function isBilling(kind: AddressKind): boolean {
  return BILLING.includes(kind);
}

/** Cette ligne est-elle une livraison, quel que soit son encodage ? */
export function isDelivery(kind: AddressKind): boolean {
  return DELIVERY.includes(kind);
}
