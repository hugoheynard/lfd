import { InjectionToken, type Signal } from '@angular/core';

/**
 * Ce dont un indicateur de section a besoin, et **rien de plus**.
 *
 * `SectionState` injectait `ProductFormStore` en entier : un composant de
 * présentation dépendait donc de mille lignes d'état produit — prix, allergènes,
 * bindings Shopify — pour afficher un point et deux boutons. Une famille ne peut
 * rien en faire.
 *
 * Quatre membres, tous portant la même clé de section. Les signatures prennent
 * `string` et non une union : c'est l'IMPLÉMENTATION qui connaît ses sections,
 * et TypeScript accepte qu'un store dont les méthodes prennent son union propre
 * satisfasse ce contrat (les paramètres de méthode sont bivariants). Le typage
 * fin revient par le générique de `SectionState`, où il sert vraiment — au bord,
 * dans le gabarit.
 */
export interface SectionEditing {
  /** Une écriture est en cours quelque part — tout enregistrement attend. */
  readonly busy: Signal<boolean>;
  /** Cette section a-t-elle des modifications en attente ? */
  isDirty(section: string): boolean;
  /** Retour à la dernière valeur enregistrée de cette section. */
  revert(section: string): void;
  /** L'état momentané — « Enregistrement… », « Enregistré ✓ », « Échec », ou vide. */
  statusText(section: string): string;
}

/**
 * Le store d'édition de l'écran courant. Fourni par la PAGE (`useExisting` sur
 * son propre store), jamais à la racine : deux formulaires ouverts n'ont aucune
 * raison de partager un état d'édition.
 */
export const SECTION_EDITING = new InjectionToken<SectionEditing>('SECTION_EDITING');
