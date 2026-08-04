import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldInputComponent,
} from 'fold-ng';

import type { EditorialFields } from '../../product-http-api';
import { ProductFormStore } from '../product-form-store';
import { textValue } from './dom';

const FIELDS: readonly { key: keyof EditorialFields; label: string }[] = [
  { key: 'descriptionShort', label: 'Résumé court' },
  { key: 'brand', label: 'Marque / gamme' },
  { key: 'seoTitle', label: 'Titre SEO' },
  { key: 'seoDescription', label: 'Description SEO' },
];

/** Panneau Communication — couche éditoriale complète (un seul save). */
@Component({
  selector: 'app-communication-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, FoldInputComponent],
  templateUrl: './communication-panel.html',
  styleUrl: './panel.scss',
})
export class CommunicationPanel {
  protected readonly store = inject(ProductFormStore);
  protected readonly textValue = textValue;
  protected readonly fields = FIELDS;
}
