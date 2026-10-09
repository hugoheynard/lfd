import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { contactDialogCopy } from '../../copy/screens/contact-dialog.copy';
import { dialogSide } from '../../panel-side';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { telHref, type ShownPhone } from '../contact-settings.store';

/** Ce qu'il faut pour ouvrir : les numéros déjà retenus pour le public, libellés. */
export interface CallDialogData {
  readonly phones: readonly ShownPhone[];
}

/**
 * **« Nous appeler »** — le choix d'un numéro, quand il y en a plusieurs
 * (Hugo, 2026-10-09 : « plutôt ouvrir un dialog avec les différents contacts »).
 *
 * Un seul numéro ne passe pas par ici : la carte en fait directement un `tel:`,
 * un dialogue pour un seul choix serait une étape pour rien. Chaque ligne est
 * un vrai lien `tel:` — c'est le système qui décide quoi faire d'un numéro.
 */
@Component({
  selector: 'app-call-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './call-dialog.html',
})
export class CallDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /** Ouvre le choix. `stack` quand on l'ouvre depuis un panneau, qui reste dessous. */
  static open(
    panels: FoldPanelHostService,
    data: CallDialogData,
    stack = false,
  ): FoldPanelRef<undefined> {
    return panels.open<CallDialogData, undefined>(CallDialog, { side: dialogSide(), stack, data });
  }

  readonly data = input.required<CallDialogData>();

  private readonly ref = inject(FoldPanelRef);
  private readonly panels = inject(FoldPanelHostService);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = computed(() => contactDialogCopy(this.locale()));
  protected readonly telHref = telHref;

  /** Écrire plutôt qu'appeler : ce dialogue cède la place à « Nous écrire ». */
  protected write(): void {
    this.ref.close(undefined);
    ContactDialog.open(this.panels);
  }

  protected close(): void {
    this.ref.close(undefined);
  }
}
