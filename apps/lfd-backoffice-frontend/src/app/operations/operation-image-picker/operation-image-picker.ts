import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LibrarySearch } from '../../mediatheque/state/library-search';
import { LibraryChoice } from '../../mediatheque/ui/library-choice/library-choice';

/** Charge d'ouverture : l'image que l'opération porte déjà (`''` : aucune). */
export interface OperationImagePickerData {
  readonly currentUrl: string;
}

/**
 * **Choisir l'image d'une opération dans la médiathèque** (O3 du plan) — la
 * recherche par étiquette de la médiathèque, en panneau. Ferme sur l'adresse
 * choisie ; renoncer ne rend rien.
 *
 * Aucun dépôt ici, comme partout ailleurs : on désigne une image du fonds, la
 * médiathèque la décrit (texte alternatif, point focal) et compte l'opération
 * parmi ses porteurs.
 */
@Component({
  selector: 'app-operation-image-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, LibraryChoice],
  providers: [LibrarySearch],
  templateUrl: './operation-image-picker.html',
})
export class OperationImagePicker {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);

  readonly data = input.required<OperationImagePickerData>();

  protected pick(image: Pick<LibraryMediaView, 'url'>): void {
    this.ref.close(image.url);
  }
}
