import type { PackingSheet } from '@lfd/contracts';

/**
 * Les petites fonctions pures du poste de colisage — et **aucune n'est un
 * calcul**.
 *
 * 🔴 **L'écran n'additionne rien** (décidé le 2026-09-14). Ce fichier portait la
 * superposition des coches locales et le **recalcul de la balance** : l'écran
 * refaisait `allocated` et `remaining` à chaque coche, et deux calculs du même
 * chiffre divergent à la première règle modifiée d'un seul côté. Tout chiffre
 * vient désormais du serveur (`documentation/production/plan-poste-de-colisage.md`,
 * « L'écran n'additionne rien ») ; il ne reste ici qu'un type de pile, une clé
 * et un libellé. Le filtre de texte de la recherche vit dans
 * `colisage/packing-search.ts` depuis le 2026-09-14.
 */

/**
 * Les deux piles de la colonne de gauche : ce qui reste à préparer, ce qui est
 * déclaré prêt. Ici plutôt que dans un composant : l'orchestrateur et la liste
 * des commandes la parlent tous les deux.
 */
export type PackingStack = 'todo' | 'ready';

/** La clé d'une case en cours d'envoi : une ligne d'une commande d'une journée. */
export function packingMarkKey(date: string, reference: string, sku: string): string {
  return `${date} ${reference} ${sku}`;
}

/** « Retrait » / « Livraison » — sur quelle pile le bac va. */
export function methodLabel(method: PackingSheet['fulfillmentMethod']): string {
  return method === 'pickup' ? 'Retrait' : 'Livraison';
}
