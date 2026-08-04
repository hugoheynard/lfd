import {
  ChangeDetectionStrategy,
  Component,
  model,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

export interface MediaSlot {
  role: string;
  url: string;
  alt?: string;
}

const MEDIA_ROLES: readonly { value: string; label: string }[] = [
  { value: 'hero', label: 'Principale' },
  { value: 'gallery', label: 'Galerie' },
  { value: 'lifestyle', label: 'Ambiance' },
  { value: 'thumbnail', label: 'Miniature' },
  { value: 'print', label: 'Impression' },
];

/** Panneau Visuels — la persistance média n'est pas encore branchée (stockage à venir). */
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
  readonly media = model.required<MediaSlot[]>();

  protected readonly roles = MEDIA_ROLES;

  protected add(): void {
    this.media.update((current) => [
      ...current,
      { role: current.length === 0 ? 'hero' : 'gallery', url: '' },
    ]);
  }

  protected remove(index: number): void {
    this.media.update((current) =>
      current.filter((_, position) => position !== index),
    );
  }

  protected set(index: number, key: 'role' | 'url' | 'alt', value: string): void {
    this.media.update((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, [key]: value } : slot,
      ),
    );
  }
}
