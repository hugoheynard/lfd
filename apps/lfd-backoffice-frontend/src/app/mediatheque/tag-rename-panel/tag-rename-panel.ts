import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { MediaTagView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { normalizeTag } from '../tag-palette';

/** Le mot à renommer, et le vocabulaire où il pourrait tomber sur un autre. */
export interface TagRenamePanelData {
  readonly tag: MediaTagView;
  readonly vocabulary: readonly MediaTagView[];
}

/** Le nouveau mot, tel que saisi. `undefined` au `closed` = annulé. */
export interface TagRenamePanelResult {
  readonly to: string;
}

/**
 * **Renommer un mot-clé partout.**
 *
 * 🔴 Si le nouveau mot existe déjà, c'est une FUSION, et elle est dite AVANT
 * de valider, avec les deux comptes : le serveur ne la distingue pas d'un
 * renommage, et elle ne se défait pas — les deux ensembles d'images ne font
 * plus qu'un.
 */
@Component({
  selector: 'app-tag-rename-panel',
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './tag-rename-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagRenamePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<TagRenamePanelResult>>(FoldPanelRef);

  readonly data = input.required<TagRenamePanelData>();

  protected readonly draft = signal('');

  /** Ce qui sera écrit — montré, pour que la normalisation ne surprenne pas. */
  protected readonly written = computed(() => normalizeTag(this.draft()));

  /** Le mot déjà porté sur lequel on tombe, `null` si c'est un vrai renommage. */
  protected readonly target = computed(() => {
    const to = this.written();
    const from = this.data().tag.tag;
    return to === from ? null : (this.data().vocabulary.find((entry) => entry.tag === to) ?? null);
  });

  /** Vide ou inchangé : le serveur le refuserait, autant ne pas le proposer. */
  protected readonly blocked = computed(
    () => this.written() === '' || this.written() === this.data().tag.tag,
  );

  protected readonly merge = computed(() => {
    const into = this.target();
    if (into === null) {
      return null;
    }
    const from = this.data().tag;
    return `« ${from.tag} » (${String(from.count)}) sera fusionné dans « ${into.tag} » (${String(into.count)}).`;
  });

  constructor() {
    effect(() => {
      this.draft.set(this.data().tag.tag);
    });
  }

  protected submit(): void {
    if (this.blocked()) {
      return;
    }
    this.ref.close({ to: this.written() });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
