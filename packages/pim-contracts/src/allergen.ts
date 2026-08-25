/**
 * Contrat de fil du **référentiel allergènes** (`GET /reference/allergens`).
 *
 * Des vues plain, sans schéma zod : c'est une réponse de LECTURE, servie depuis
 * une donnée de référence en dur côté domaine. Rien n'entre par ce chemin, il
 * n'y a donc rien à valider à la frontière.
 *
 * Il vit ici parce que la même forme était déclarée deux fois — une dans le
 * domaine, une dans les modèles du front — pour une donnée réglementée. La
 * LISTE a cessé d'être recopiée quand le front s'est branché sur l'endpoint ;
 * sa forme restait, elle, à tenir d'accord à la main.
 */

/**
 * Quel catalogue : `eu` est la liste **légale** (annexe II du règlement UE
 * 1169/2011), `world` la liste **interopérable**, codes sans obligation UE
 * compris. Ce n'est pas un filtre d'affichage anodin.
 */
export type AllergenScope = "eu" | "world";

/** Une entrée du référentiel : un code GS1, ce qu'il nomme, ce qu'il déclare. */
export interface AllergenEntry {
  /** Code de stockage canonique — GS1 `AllergenTypeCode` (T4078). */
  readonly code: string;
  /** Libellé granulaire — « Noisettes ». */
  readonly label: string;
  /** Catégorie réglementaire, `null` hors obligation UE. */
  readonly incoCategory: string | null;
  /** Libellé **d'étiquette** — « Fruits à coque ». C'est lui qui fait foi. */
  readonly incoLabel: string | null;
}

/** Le référentiel tel que l'API le rend, pour un catalogue donné. */
export interface AllergenReference {
  readonly scope: AllergenScope;
  readonly entries: readonly AllergenEntry[];
}
