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
 * « L'écran n'additionne rien ») ; il ne reste ici qu'un type de pile, une clé,
 * un libellé et un filtre de texte.
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

/**
 * Le terme de recherche, réduit à ce qui se compare : minuscules, sans accents.
 *
 * Le fournil tape « croissant » sur une étiquette qui dit « Croissant », et
 * « pate a choux » sur une fiche qui dit « Pâte à choux ». Comparer les chaînes
 * telles quelles aurait fait rater exactement les cas où l'on cherche vite.
 *
 * `NFD` sépare la lettre de son accent, et la plage `U+0300–U+036F` retire les
 * diacritiques combinants — ce que `toLowerCase()` seul ne fait pas.
 */
export function normaliseTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
}

/**
 * Cet article répond-il au terme cherché ?
 *
 * Sur le NOM **et** sur le SKU : le fournil tape « croissant », un poste qui lit
 * une étiquette de bac tape la référence article. Deux entrées pour une même
 * question, parce que ce sont deux gestes réels et non deux goûts.
 *
 * C'est un filtre de texte, pas un calcul : il choisit ce qui est surligné, il
 * ne produit aucun chiffre.
 */
export function matchesTerm(normalisedTerm: string, sku: string, productName: string): boolean {
  if (normalisedTerm === '') {
    return false;
  }
  return (
    normaliseTerm(productName).includes(normalisedTerm) ||
    normaliseTerm(sku).includes(normalisedTerm)
  );
}
