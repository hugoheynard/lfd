import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

const MEDIA_ROLES: readonly { value: string; label: string }[] = [
  { value: 'hero', label: 'Principale' },
  { value: 'gallery', label: 'Galerie' },
  { value: 'lifestyle', label: 'Ambiance' },
  { value: 'thumbnail', label: 'Miniature' },
  { value: 'print', label: 'Impression' },
];

/** Panneau Visuels — la persistance média n'est pas encore branchée. */
@Component({
  selector: 'app-visuals-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
  ],
  templateUrl: './visuals-panel.html',
  styleUrl: './panel.scss',
})
export class VisualsPanel {
  protected readonly store = inject(ProductFormStore);
  protected readonly roles = MEDIA_ROLES;
}
