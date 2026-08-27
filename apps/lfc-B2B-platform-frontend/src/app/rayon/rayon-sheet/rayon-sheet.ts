import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ClientDialog } from '../../client/client-dialog/client-dialog';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { storyOf } from '../../client/mock-rayon-stories';
import { packshotOf } from '../../client/mock-shop';

/**
 * Ce qu'un rayon raconte de lui-même — la feuille « En savoir plus ».
 *
 * Il y en a une PAR rayon, « Tout » compris : quand on ne filtre rien, c'est la
 * maison qui parle (4 h 15 au premier pétrissage, cinq personnes, 1 850 m, zéro
 * surgelé). Une boulangerie qui explique ses farines vend ses farines ; celle
 * qui n'en parle pas vend du pain au poids.
 *
 * Le texte vient du catalogue et pas des dictionnaires de langue : c'est du
 * contenu de maison, il suivra le catalogue vers le serveur.
 */
@Component({
  selector: 'app-rayon-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog],
  templateUrl: './rayon-sheet.html',
  styleUrl: './rayon-sheet.scss',
})
export class RayonSheet {
  /** Le rayon ouvert — `null` quand la feuille est fermée. */
  readonly shelf = input.required<string | null>();

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly story = computed(() => {
    const shelf = this.shelf();
    return shelf === null ? null : storyOf(shelf);
  });

  /** Le titre tient sur deux lignes dans les données : elles sont voulues. */
  protected readonly lines = computed(() => this.story()?.title.split('\n') ?? []);

  protected readonly image = computed(() => {
    const shelf = this.shelf();
    return shelf === null ? 'boule' : packshotOf(shelf);
  });
}
