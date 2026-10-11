/**
 * La forme de l'environnement de l'aperçu, À PART des deux valeurs : la
 * configuration `development` remplace `preview-environment.ts` par
 * `preview-environment.development.ts` (`angular.json`), et un type importé du
 * fichier remplacé ne se résout plus — la compilation de dev échouait.
 */
export interface PreviewEnvironment {
  /** Les origines exactes (schéma, hôte, port) du back-office qui encadre l'aperçu. */
  readonly editorOrigins: readonly string[];
}
