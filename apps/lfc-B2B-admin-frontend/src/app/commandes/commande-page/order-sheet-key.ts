import { ORDER_DOC_ORDER_SHEET } from '@lfd/b2b-ui/order';

/**
 * Cette clé de document est-elle celle du **bon de commande** ?
 *
 * Extraite de la page pour être éprouvable **sans monter Angular ni forcer
 * l'accès à un membre protégé** — un test qui casterait le composant pour
 * atteindre `onDocument` lui permettrait de dériver de sa vraie signature, ce
 * que la porte `no-type-escapes` refuse à juste titre.
 *
 * Ce n'est pas une fonction d'une ligne pour le plaisir : c'est la règle qui
 * décide entre « on télécharge » et « on dit que ça n'existe pas encore », et
 * c'est exactement celle qui manquait — le bouton ne faisait rien.
 */
export function isOrderSheet(key: string): boolean {
  return key === ORDER_DOC_ORDER_SHEET;
}
