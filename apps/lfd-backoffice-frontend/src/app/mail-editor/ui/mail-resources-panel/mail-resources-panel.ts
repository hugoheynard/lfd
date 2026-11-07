import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MailEditorResources, ModelSectionId } from '@lfd/mail-blocks';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { VARIABLE_DRAG_TYPE } from '../mail-block-fragment/mail-block-fragment';

/**
 * **« Ressources de cet e-mail »** (plan `plan-editeur-par-blocs.md`, § 24,
 * R2) : ce que l'envoi fournit pour chaque destinataire, rangé par sorte,
 * chaque ressource par sa fiche (nom lisible, description, exemple) — jamais
 * par son nom technique.
 *
 * - **Valeurs** : à glisser dans une phrase, ou à cliquer après avoir posé le
 *   curseur dans une phrase. Le panneau ne pose rien lui-même : il dit ce qui
 *   a été choisi, et le canevas vérifie que la phrase la reçoit.
 * - **Liens** et **blocs de données** : déjà dans la mise en page ; les
 *   survoler ou les focaliser éclaire le bloc de l'e-mail qui les porte.
 */
@Component({
  selector: 'app-mail-resources-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './mail-resources-panel.html',
  styleUrl: './mail-resources-panel.scss',
})
export class MailResourcesPanel {
  readonly resources = input.required<MailEditorResources>();
  readonly canWrite = input(false);
  /** Les valeurs qu'au moins une phrase modifiable de l'e-mail reçoit. */
  readonly placeable = input<ReadonlySet<string>>(new Set());
  /** Les valeurs qu'une phrase modifiable exige. */
  readonly required = input<ReadonlySet<string>>(new Set());

  /** Une valeur cliquée : le canevas la pose au dernier curseur. */
  readonly valuePicked = output<string>();
  /** Le bloc du modèle à éclairer dans l'e-mail ; `null` quand le survol s'en va. */
  readonly lit = output<ModelSectionId | null>();

  protected onDragStart(event: DragEvent, name: string): void {
    event.dataTransfer?.setData(VARIABLE_DRAG_TYPE, name);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
}
