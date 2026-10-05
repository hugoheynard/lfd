/**
 * **Le verrou de la hiérarchie des comptes** (plan `plan-sous-comptes.md`, §5).
 *
 * UN seul verrou pour tout le portefeuille, et c'est voulu. Un déclencheur qui
 * lit une autre ligne en READ COMMITTED ne voit pas l'écriture concurrente :
 * A→B pendant B→C donnerait une profondeur 2, A→B pendant B→A un cycle. Tout
 * geste qui touche la hiérarchie ou les suivis le prend d'abord, puis RELIT
 * les lignes et laisse l'agrégat trancher. Ces gestes sont rares : un verrou
 * global ne coûte rien et ferme toutes les courses.
 *
 * Il se prend dans une unité de travail et se relâche à sa fin.
 */
export abstract class AccountHierarchyLock {
  abstract acquire(): Promise<void>;
}
