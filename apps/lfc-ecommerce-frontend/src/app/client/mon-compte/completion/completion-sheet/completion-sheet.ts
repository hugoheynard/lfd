import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CompanyActivationChecklist, type CompanyActivationStep } from '@lfd/b2b-ui/company';
import {
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';

/** Ce que la liste repliée reçoit : ses étapes, sa synthèse et sa mention. */
export interface CompletionSheetData {
  readonly steps: readonly CompanyActivationStep[];
  readonly title: string;
  readonly optionalNote: string;
}

/**
 * **Ce qui manque au dossier**, déplié dans la feuille du bas (Hugo,
 * 2026-10-27) : au téléphone, l'encart de `/mon-compte` se replie en une ligne
 * et un bouton « Voir ». La liste et ses boutons sont ceux de l'encart ; un
 * bouton referme la feuille en rendant la clé de l'étape, et la page ouvre le
 * même dialogue que depuis la carte.
 */
@Component({
  selector: 'app-completion-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyActivationChecklist, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './completion-sheet.html',
})
export class CompletionSheet {
  /** Rend la clé de l'étape choisie, ou `undefined` si l'on ferme. */
  static open(
    panels: FoldPanelHostService,
    data: CompletionSheetData,
  ): FoldPanelRef<string | undefined> {
    return panels.open<CompletionSheetData, string | undefined>(CompletionSheet, {
      side: 'bottom',
      surface: 'solid',
      data,
    });
  }

  readonly data = input.required<CompletionSheetData>();

  private readonly ref = inject(FoldPanelRef);
  protected readonly t = inject(ClientCopyService).t;

  protected pick(key: string): void {
    this.ref.close(key);
  }
}
