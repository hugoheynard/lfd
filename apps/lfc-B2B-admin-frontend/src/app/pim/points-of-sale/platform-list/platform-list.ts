import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
} from 'fold-ng';

import { SalesContextStore } from '../../catalogue/sales-contexts/sales-context-store';
import { PointOfSaleStore } from '../point-of-sale-store';

/**
 * Les **plateformes** de vente — la boutique professionnelle B2B aujourd'hui.
 *
 * En lecture, et ce n'est pas une étape : une plateforme ne se crée pas et ne
 * se supprime pas. Elle est semée au démarrage, comme le contexte de vente
 * racine et pour la même raison — sans elle, la matrice B2B n'a plus de cible
 * et la boutique professionnelle se vide sans qu'une erreur soit levée.
 *
 * Ce composant ne montre donc rien de neuf au système ; il montre pour la
 * première fois quelque chose qui existait déjà et qu'aucun écran ne pouvait
 * afficher — le B2B se lisait comme un `NULL` dans la matrice de canaux.
 */
@Component({
  selector: 'app-platform-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './platform-list.html',
  styleUrl: './platform-list.scss',
})
export class PlatformList {
  private readonly store = inject(PointOfSaleStore);
  private readonly contexts = inject(SalesContextStore);

  protected readonly platforms = this.store.platforms;
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  protected readonly loadError = this.store.loadError;

  /** Clé → libellé, une fois pour toute la liste plutôt qu'une recherche par carte. */
  private readonly labelOfContext = computed(
    () => new Map(this.contexts.items().map((context) => [context.key, context.label])),
  );

  /**
   * Ce que la plateforme offre, en libellés.
   *
   * La clé est rendue **telle quelle** si le registre ne la connaît pas encore :
   * la liste des contextes se charge de son côté, et un trou de course ne doit
   * pas faire disparaître une ligne de l'écran.
   */
  protected offeredLabels(contexts: readonly string[]): readonly string[] {
    const labels = this.labelOfContext();
    return contexts.map((key) => labels.get(key) ?? key);
  }
}
