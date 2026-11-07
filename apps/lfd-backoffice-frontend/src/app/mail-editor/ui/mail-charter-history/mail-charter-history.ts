import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type { MailCharterHistoryView, MailSpace } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldTimelineComponent,
  type FoldTimelineNode,
} from 'fold-ng';

import { MailChartersService } from '../../data/mail-charters.service';

/** L'instant d'un geste, à l'heure de la boulangerie. */
const WHEN = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **L'historique d'une charte** (§ 25, C2) : les versions publiées, de la
 * plus récente à la plus ancienne, qui et quand. Liste seule, comme
 * l'historique d'un e-mail. Se relit quand `refresh` change : la page
 * l'incrémente après publier.
 */
@Component({
  selector: 'app-mail-charter-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    FoldTimelineComponent,
  ],
  templateUrl: './mail-charter-history.html',
})
export class MailCharterHistory {
  readonly space = input.required<MailSpace>();
  readonly refresh = input(0);

  private readonly api = inject(MailChartersService);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly history = signal<MailCharterHistoryView | null>(null);

  readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    (this.history()?.versions ?? []).map((version) => ({
      key: String(version.version),
      id: null,
      label: `Version ${version.version}${version.current ? ' — en service' : ''} · publiée par ${version.staffId}`,
      displayDate: WHEN.format(new Date(version.at)),
      done: version.current,
    })),
  );

  constructor() {
    effect(() => {
      const space = this.space();
      this.refresh();
      untracked(() => void this.load(space));
    });
  }

  private request = 0;

  protected async load(space: MailSpace = this.space()): Promise<void> {
    const request = ++this.request;
    if (this.history() === null) {
      this.status.set('loading');
    }
    try {
      const history = await this.api.history(space);
      if (request === this.request) {
        this.history.set(history);
        this.error.set(null);
        this.status.set('ready');
      }
    } catch (error) {
      if (request === this.request) {
        this.error.set(httpErrorMessage(error, 'L’historique de la charte n’a pas pu être lu.'));
        this.status.set('failed');
      }
    }
  }
}
