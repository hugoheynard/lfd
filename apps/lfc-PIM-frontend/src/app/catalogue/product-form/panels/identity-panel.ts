import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import type { Category, ProductKind } from '../../../data/models';

export interface KindOption {
  readonly value: ProductKind;
  readonly label: string;
}

/** Panneau Identité — nom, nature, famille, référence. Présentational : l'état
 *  vit dans le parent via des `model()` ; le save remonte par l'output. */
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
  readonly name = model.required<string>();
  readonly kind = model.required<ProductKind>();
  readonly categoryId = model.required<string>();
  readonly sku = model.required<string>();

  readonly kinds = input.required<readonly KindOption[]>();
  readonly categories = input.required<readonly Category[]>();
  readonly isEdit = input(false);
  readonly saveable = input(false);
  readonly status = input('');
  readonly save = output<void>();

  protected setKind(value: string): void {
    if (value === 'daily' || value === 'made_to_order' || value === 'resale') {
      this.kind.set(value);
    }
  }

  protected setCategory(value: string): void {
    if (value !== '') {
      this.categoryId.set(value);
    }
  }
}
