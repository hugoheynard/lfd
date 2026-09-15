import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { PhotoCardViewerLabels } from '../photo-cards.labels';

/** Charge d'ouverture de la vue en grand. */
export interface PhotoCardViewerData {
  /** Le titre de la carte, qui nomme le dialogue. */
  readonly title: string;
  readonly labels: PhotoCardViewerLabels;
  /** Les octets de la photo lisible — lus à l'ouverture, pas avant. */
  readonly load: () => Promise<Blob>;
}

/**
 * La **photo lisible d'une carte, en grand** : un dialogue fold centré, qui
 * ouvre l'image ajustée et la bascule à sa taille réelle d'un clic — de quoi
 * lire une petite écriture sur une note papier. Au doigt, le pincement du
 * navigateur fait le reste.
 *
 * C'est le seul endroit où la photo pleine taille transite : la liste n'en
 * charge que les vignettes (plan « notes photo du commercial », D7 bis).
 */
@Component({
  selector: 'lfd-photo-card-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './photo-card-viewer.html',
  styleUrl: './photo-card-viewer.scss',
})
export class PhotoCardViewer {
  /** Au centre et au plus large : une page A4 photographiée se lit en hauteur. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'xl', surface: 'solid' };

  private readonly ref = inject(FoldPanelRef);

  readonly data = input.required<PhotoCardViewerData>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly url = signal<string | null>(null);
  /** `false` : ajustée à la place disponible ; `true` : à sa taille réelle, qu'on fait défiler. */
  protected readonly actualSize = signal(false);
  private destroyed = false;

  constructor() {
    effect(() => {
      this.data();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.forget();
    });
  }

  protected async load(): Promise<void> {
    const data = this.data();
    this.state.set('loading');
    try {
      const blob = await data.load();
      if (this.destroyed || data !== this.data()) {
        return;
      }
      this.forget();
      this.url.set(URL.createObjectURL(blob));
      this.state.set('ready');
    } catch {
      if (!this.destroyed) {
        this.state.set('error');
      }
    }
  }

  protected toggleSize(): void {
    this.actualSize.update((actual) => !actual);
  }

  protected close(): void {
    this.ref.close();
  }

  private forget(): void {
    const url = this.url();
    if (url !== null) {
      URL.revokeObjectURL(url);
      this.url.set(null);
    }
  }
}
