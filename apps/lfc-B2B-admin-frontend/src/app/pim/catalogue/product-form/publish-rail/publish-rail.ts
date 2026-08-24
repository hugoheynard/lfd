import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { ProductFormStore } from '../product-form-store';

interface Check {
  readonly label: string;
  readonly done: boolean;
}

/**
 * Le rail collant : ce qui reste en attente, et ce qui manque.
 *
 * « Tout enregistrer » remplace l'avertissement au départ. Il n'y a plus de
 * raison de quitter la page sans avoir vu ce qui est en attente, puisque c'est
 * affiché en permanence à hauteur d'œil — un geste pour l'utilisateur, N appels
 * pour l'API, et les échecs restent indépendants (une section qui échoue reste
 * marquée « Modifié », les autres passent).
 *
 * La complétude est délibérément **partielle**. Elle ne liste que ce que le
 * modèle actuel sait : nom, famille, prix, allergènes, description. Les trois
 * lignes de la maquette qui portent sur le poids brut d'un conditionnement et
 * sur les traductions n'y sont pas, parce que ni les conditionnements ni la
 * troisième langue n'existent encore côté modèle. Une case à cocher qui ne
 * mesure rien est pire qu'une case absente.
 *
 * La barre de progression de la maquette n'est pas rendue : ce serait un `div`
 * de 4px dessiné à la main. Il manque un `fold-meter` (`role="meter"`, valeur +
 * max, aucune interaction) — `fold-slider` ne convient pas, c'est un
 * `input type="range"` focalisable.
 */
@Component({
  selector: 'app-publish-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './publish-rail.html',
  styleUrl: './publish-rail.scss',
})
export class PublishRail {
  protected readonly store = inject(ProductFormStore);

  /** Lance l'enregistrement de toutes les sections modifiées. */
  readonly saveAll = output<void>();

  protected readonly checks = computed<Check[]>(() => [
    { label: 'Nom et famille', done: this.store.isValid() },
    { label: 'Prix', done: this.store.priceEur() !== null },
    {
      label: 'Allergènes déclarés',
      done: this.store.declaresNone() || this.store.selected().length > 0,
    },
    {
      // La SOURCE fait foi pour la complétude : une fiche est publiable en
      // français, les traductions sont un autre sujet (et un autre indicateur).
      label: 'Description',
      done: (this.store.editorial().descriptionShort?.[SOURCE_LOCALE] ?? '').trim() !== '',
    },
    { label: 'Au moins un visuel', done: this.store.media().length > 0 },
  ]);

  protected readonly done = computed(() => this.checks().filter((c) => c.done).length);
}
