/**
 * **Ce que la fiche produit sait faire pour les autres sous-contextes** —
 * sa porte d'entrée (`documentation/pim/architecture-du-referentiel.md`).
 *
 * Un canal n'atteint l'application d'un sous-contexte que par ici : ce qui
 * y est rangé est un contrat, le reste peut bouger sans prévenir.
 */

/** Déclarer une déclinaison sur mesure, ou la rouvrir — le geste de la carte « Produit sur mesure ». */
export { SetVariantCustomRecipeCommand } from "./variants/set-variant-custom-recipe.js";
