import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { SECTION_EDITING } from './section-editing';

/**
 * L'état d'une section, à droite de son titre — en permanence.
 *
 * C'est le cœur du modèle d'édition : rien n'est « en lecture » puis « en
 * modification », un référentiel se corrige au passage. Ce qui change, c'est ce
 * que la section AFFICHE, toujours au même endroit. Le bouton d'enregistrement
 * n'est donc jamais désactivé ni caché — il est *absent* quand il n'y a rien à
 * enregistrer.
 *
 * Ce qui manque encore, et qui est une demande à l'API : un `updatedAt` par
 * section. « De quand date cette valeur » est souvent l'information la plus
 * utile d'un référentiel partagé, et nous ne l'avons pas. Un horodatage posé
 * côté client ne connaîtrait que les enregistrements de CETTE session : il
 * afficherait une date fausse pour tout ce qu'un collègue a écrit hier, ce qui
 * est pire que de n'en afficher aucune. D'où « À jour » sans date.
 */
@Component({
  selector: 'app-section-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './section-state.html',
  styleUrl: './section-state.scss',
})
export class SectionState<TSection extends string> {
  protected readonly store = inject(SECTION_EDITING);

  /** La section dont cet indicateur porte l'état. */
  readonly section = input.required<TSection>();

  /** Demande d'enregistrement — la page sait quel appel correspond. */
  readonly save = output<TSection>();

  protected readonly saving = computed(
    () => this.store.statusText(this.section()) === 'Enregistrement…',
  );
}
