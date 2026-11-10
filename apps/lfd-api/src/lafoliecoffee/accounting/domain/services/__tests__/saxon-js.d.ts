/**
 * La seule surface de `saxon-js` 2.7 que les specs appellent : une
 * transformation synchrone d'une feuille compilée (SEF) sur un texte XML,
 * sérialisée en chaîne. Le paquet ne publie aucun type.
 */
declare module "saxon-js" {
  interface SaxonTransformOptions {
    readonly stylesheetFileName: string;
    readonly sourceText: string;
    readonly destination: "serialized";
  }
  interface SaxonTransformResult {
    readonly principalResult: string;
  }
  const SaxonJS: {
    transform(options: SaxonTransformOptions, mode: "sync"): SaxonTransformResult;
  };
  export default SaxonJS;
}
