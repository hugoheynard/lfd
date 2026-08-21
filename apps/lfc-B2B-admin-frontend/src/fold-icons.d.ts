import type { APP_ICONS } from './app/shared/icons/app-icons';

/**
 * Les noms d'icônes que **l'application** ajoute au jeu de fold.
 *
 * Depuis fold 0.11, `FoldIconName` est fermé : il n'accepte plus n'importe
 * quelle chaîne, donc un nom maison doit être déclaré ici pour compiler. Le
 * dessin, lui, vit dans `app/shared/icons/app-icons.ts` — les deux vont
 * ensemble, et une greffe l'a prouvé : déplacé sans lui, le module ne compilait
 * plus sur cinq fichiers d'un coup.
 *
 * La liste est **dérivée** du catalogue plutôt que recopiée : ajouter une
 * icône là-bas suffit. Une liste tenue à la main finit par oublier une entrée,
 * et l'oubli ne se voit qu'au premier composant qui s'en sert.
 *
 * ⚠️ Ce bloc vit dans un `.d.ts`, et pas à côté du dessin. Une augmentation ne
 * s'applique qu'aux unités de compilation qui la CONTIENNENT : `tsconfig.spec.json`
 * n'inclut que `src/**\/*.d.ts` et `src/**\/*.spec.ts`, si bien qu'une
 * déclaration posée dans le `.ts` compilait l'application et pas les tests. Ici,
 * les deux programmes la voient.
 *
 * Les ÉCRASEMENTS (`logout`) n'y figurent pas : leur nom est déjà connu de fold.
 * `Omit` les retire, sans qu'on ait à tenir une seconde liste.
 */
declare module 'fold-ng' {
  interface FoldCustomIcons extends Record<keyof Omit<typeof APP_ICONS, 'logout'>, true> {}
}
