import type { FoldIconName } from 'fold-ng';

/**
 * Une entrée d'outillage de développement dans le rail.
 *
 * 🔴 **Dans son propre fichier, et c'est obligatoire.** Ce type était déclaré
 * dans `dev-tools.ts` — qui est précisément le fichier que `fileReplacements`
 * remplace. La variante de développement l'importait donc depuis un chemin qui,
 * dans un build de développement, désignait la variante elle-même : elle
 * s'important elle-même, et la compilation ne trouvait plus le type.
 *
 * Ce fichier-ci n'est jamais remplacé. C'est la règle générale du mécanisme :
 * **ce qui est commun aux deux variantes ne peut pas vivre dans l'une d'elles.**
 */
export interface DevTool {
  readonly label: string;
  /**
   * Le nom d'icône du référentiel fold, pas une chaîne libre : une icône
   * inconnue ne lève rien à l'exécution, elle ne dessine simplement rien.
   */
  readonly icon: FoldIconName;
  readonly route: string;
}
