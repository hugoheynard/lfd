import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * Panneau Identité — nom, nature, famille. La **référence** y figure en lecture
 * seule (édition seulement) : elle est émise par le référentiel, pas saisie.
 */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
  ],
  templateUrl: './identity-panel.html',
  styleUrl: './panel.scss',
})
export class IdentityPanel {
  protected readonly store = inject(ProductFormStore);
}
