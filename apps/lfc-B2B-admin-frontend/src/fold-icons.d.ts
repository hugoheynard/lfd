/**
 * Les noms d'icônes que le **référentiel** ajoute au jeu de fold.
 *
 * Depuis fold 0.11, `FoldIconName` est fermé : il n'accepte plus n'importe
 * quelle chaîne, donc un nom maison doit être déclaré ici pour compiler. Le
 * dessin, lui, est enregistré dans `app/pim/pim-icons.ts` — les deux vont
 * ensemble, et la greffe l'a prouvé : déplacé sans lui, le module ne compilait
 * plus sur cinq fichiers d'un coup.
 *
 * ⚠️ Ce bloc vit dans un `.d.ts`, et pas à côté du dessin dans le `.ts`. Une
 * augmentation ne s'applique qu'aux unités de compilation qui la CONTIENNENT :
 * `tsconfig.spec.json` n'inclut que `src/**\/*.d.ts` et `src/**\/*.spec.ts`, si
 * bien qu'une déclaration posée dans `pim-icons.ts` compilait l'application et
 * pas les tests. Ici, les deux programmes la voient.
 *
 * `logout` n'y figure pas : l'écraser garde son nom, déjà connu de fold.
 */

// Rend ce fichier MODULE et non script global : sans un import/export de premier
// niveau, `declare module 'fold-ng'` déclare un module ambiant qui REMPLACE le
// vrai — et tous les composants de fold disparaissent d'un coup.
export {};
declare module 'fold-ng' {
  interface FoldCustomIcons {
    shopify: true;
  }
}
