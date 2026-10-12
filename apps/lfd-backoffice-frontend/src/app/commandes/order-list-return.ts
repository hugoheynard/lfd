/**
 * La clé d'état de navigation posée par la liste des commandes en ouvrant une
 * commande (`router.navigate(…, { state })`).
 *
 * Le détail la lit pour savoir que son retour peut **remonter l'historique** :
 * l'entrée précédente est alors la liste, avec ses filtres dans l'adresse.
 * `fold-back-link` ne transmet pas de `queryParams` à son `routerLink`
 * (vérifié dans `fold-ng.d.ts` le 2026-10-12) ; sans cette clé, un retour par
 * lien perdrait les filtres. Ouverte autrement (un lien partagé, un autre
 * écran), la commande revient à la liste nue.
 */
export const FROM_ORDER_LIST = 'fromOrderList';

/** Vrai si cet état de navigation vient de la liste des commandes. */
export function cameFromOrderList(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[FROM_ORDER_LIST] === true
  );
}
