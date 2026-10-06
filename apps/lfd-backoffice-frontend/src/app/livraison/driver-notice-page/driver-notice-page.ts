import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { MyDriverNoticeView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { DriverNoticeService } from '../driver-notice.service';
import { DriverNoticeText } from '../driver-notice-text/driver-notice-text';

type NoticeState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly mine: MyDriverNoticeView };

/** « 6 octobre 2026 », à Paris. */
function parisDateOf(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * **Mes données** — le texte d'information du livreur, à relire quand il veut
 * (`documentation/legal/rgpd-livreur.md`, §7 point 2). Une lecture : rien ne
 * s'y accuse, c'est le départ qui le demande.
 */
@Component({
  selector: 'app-driver-notice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DriverNoticeText,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './driver-notice-page.html',
  styleUrl: './driver-notice-page.scss',
})
export class DriverNoticePage {
  private readonly api = inject(DriverNoticeService);

  protected readonly state = signal<NoticeState>({ status: 'loading' });
  protected readonly mine = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.mine : null;
  });

  /** « Lu le 6 octobre 2026 à 7 h 42 ». */
  protected readonly readOn = (iso: string): string =>
    `Lu le ${parisDateOf(iso)} à ${parisTimeOf(iso)}.`;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      this.state.set({ status: 'ready', mine: await this.api.mine() });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
