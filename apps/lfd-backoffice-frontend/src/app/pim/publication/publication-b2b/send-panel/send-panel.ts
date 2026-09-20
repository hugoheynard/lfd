import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

/** Ce que l'écran de publication montre au panneau : ce qui va partir. */
export interface SendPanelData {
  readonly entering: number;
  readonly changing: number;
  readonly removing: number;
}

/** Ce que le panneau rend quand on confirme. `null` = on a renoncé. */
export interface SendIntent {
  readonly label: string;
  readonly note: string | null;
}

/**
 * **Le panneau d'envoi** — ce qu'on publie, et pourquoi.
 *
 * ## Pourquoi un panneau, et pas un champ de plus sur l'écran
 *
 * Le champ vivait sous le bouton. Il marchait, et il disait mal ce qu'il
 * était : une ligne de formulaire parmi d'autres, sur un écran qu'on ouvre pour
 * regarder. Envoyer le catalogue chez des clients est le geste le plus
 * conséquent du référentiel — il mérite un moment à lui, où l'on ne fait que
 * ça.
 *
 * Un panneau MODAL et non un dialogue centré : fold n'a pas de dialogue, et il
 * le dit lui-même (« No modal dialog yet — use a modal `fold-panel-host` »). Le
 * panneau apporte ce qu'une fausse modale rate toujours — le fond inerte, le
 * piège de focus, le retour du focus à la fermeture, la touche Échap.
 *
 * ## Deux champs, deux lectures
 *
 * Le **nom** se lit dans une liste, à côté de quinze autres : il tient en une
 * phrase. La **note** se lit quand on ouvre, six mois plus tard, devant un
 * client qui conteste un prix.
 *
 * La note reste **facultative**, même quand le nom ne l'est pas : un envoi de
 * routine se nomme en cinq mots et n'a rien de plus à dire. La rendre
 * obligatoire ferait écrire « RAS » quatre-vingt-dix fois, et une note remplie
 * par obligation ne se relit pas.
 */
@Component({
  selector: 'app-send-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './send-panel.html',
  styleUrl: './send-panel.scss',
})
export class SendPanel {
  readonly data = input.required<SendPanelData>();

  private readonly panel = inject(FoldPanelRef<SendIntent | null>);

  protected readonly label = signal('');
  protected readonly note = signal('');

  /** Rien ne part sans nom : c'est lui qui rend la révision relisible. */
  protected readonly canSend = computed(() => this.label().trim() !== '');

  /** Ce que l'envoi va faire, en une ligne — pour ne pas confirmer à l'aveugle. */
  protected readonly summary = computed(() => {
    const { entering, changing, removing } = this.data();
    const parts = [
      entering > 0 ? `${String(entering)} entrant(s)` : null,
      changing > 0 ? `${String(changing)} modifié(s)` : null,
      removing > 0 ? `${String(removing)} retiré(s)` : null,
    ].filter((part): part is string => part !== null);
    return parts.length === 0 ? 'aucun changement' : parts.join(' · ');
  });

  protected confirm(): void {
    const label = this.label().trim();
    if (label === '') {
      return;
    }
    const note = this.note().trim();
    this.panel.close({ label, note: note === '' ? null : note });
  }

  protected cancel(): void {
    this.panel.close(null);
  }
}
