import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MediaTagView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

/** Le mot à retirer, avec le compte qui fait la question. */
export interface TagRemovePanelData {
  readonly tag: MediaTagView;
}

/**
 * **Retirer un mot-clé de tout le fonds.**
 *
 * La question porte le COMPTE : « retirer de 3 images » ne se décide pas
 * comme « retirer de 300 ». Et elle dit ce qui ne bouge pas — les images —
 * parce que « supprimer » laisserait craindre pour elles.
 *
 * Rend `true` à la confirmation, `undefined` sinon.
 */
@Component({
  selector: 'app-tag-remove-panel',
  imports: [
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './tag-remove-panel.html',
  styleUrl: './tag-remove-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagRemovePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<true>>(FoldPanelRef);

  readonly data = input.required<TagRemovePanelData>();

  protected readonly question = computed(() => {
    const { tag, count } = this.data().tag;
    return `Retirer « ${tag} » de ${imagesLabel(count)} ?`;
  });

  protected confirm(): void {
    this.ref.close(true);
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** « 1 image », « 3 images » — partagé avec le message de succès. */
export function imagesLabel(count: number): string {
  return count === 1 ? '1 image' : `${String(count)} images`;
}
