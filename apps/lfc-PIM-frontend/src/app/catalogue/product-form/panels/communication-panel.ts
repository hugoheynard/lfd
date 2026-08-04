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
} from 'fold-ng';

import type { EditorialFields } from '../../product-http-api';

const EDITORIAL_FIELDS: readonly { key: keyof EditorialFields; label: string }[] =
  [
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
  readonly editorial = model.required<EditorialFields>();

  readonly saveable = input(false);
  readonly status = input('');
  readonly save = output<void>();

  protected readonly fields = EDITORIAL_FIELDS;

  protected value(key: keyof EditorialFields): string {
    return this.editorial()[key];
  }

  protected set(key: keyof EditorialFields, value: string): void {
    this.editorial.update((current) => ({ ...current, [key]: value }));
  }

  protected text(event: Event): string {
    return event.target instanceof HTMLTextAreaElement ? event.target.value : '';
  }
}
