/**
 * **L'union des allergènes déclarés du catalogue publié** — les traces que la
 * règle B sert à une déclinaison sans déclaration
 * (`documentation/pim/plan-allergenes-jamais-bloquants.md` §1).
 *
 * Une lecture par PROJECTION, jamais par déclinaison : la liste couvre tout le
 * catalogue, et elle se recalcule à chaque fois — figée, elle deviendrait
 * fausse au premier produit ajouté.
 *
 * Séparé du dépôt des fiches (ISP) : la projection ne charge pas le catalogue
 * entier pour en extraire des codes.
 */
export abstract class PublishedAllergensReader {
  /** Les codes GS1, sans doublon et rangés ; `[]` quand rien n'est déclaré. */
  abstract union(): Promise<readonly string[]>;
}
