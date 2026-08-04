import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/** Panneau Identité — nom, nature, famille, référence. Lit/écrit le store injecté. */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
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
