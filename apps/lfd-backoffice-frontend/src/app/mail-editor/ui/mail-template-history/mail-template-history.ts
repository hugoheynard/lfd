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
import type { MailDocumentHistoryView } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldTimelineComponent,
  type FoldTimelineNode,
} from 'fold-ng';

import { MailEditorService } from '../../data/mail-editor.service';

/** L'instant d'un geste, à l'heure de la boulangerie. */
const WHEN = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **L'historique d'un e-mail** (§ 6, S5c) : les versions publiées, de la plus
 * récente à la plus ancienne, qui et quand, et le dernier retour au modèle
 * d'origine. Liste seule : le contrat n'a aucune route qui rende une version
 * passée (`mail-editor-routes.ts`, vérifié le 2026-11-07) — l'aperçu fidèle
 * d'une ancienne version attend une route.
 *
 * Se relit quand `refresh` change : la page l'incrémente après publier ou
 * revenir.
 */
@Component({
  selector: 'app-mail-template-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    FoldTimelineComponent,
  ],
  templateUrl: './mail-template-history.html',
})
export class MailTemplateHistory {
  readonly template = input.required<string>();
  readonly refresh = input(0);

  private readonly api = inject(MailEditorService);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly history = signal<MailDocumentHistoryView | null>(null);

  readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    (this.history()?.versions ?? []).map((version) => ({
      key: String(version.version),
      id: null,
      label: `Version ${version.version}${version.current ? ' — en service' : ''} · publiée par ${version.staffId}`,
      displayDate: this.when(version.at),
      done: version.current,
    })),
  );

  protected when(at: string): string {
    return WHEN.format(new Date(at));
  }

  constructor() {
    effect(() => {
      const template = this.template();
      this.refresh();
      untracked(() => void this.load(template));
    });
  }

  private request = 0;

  protected async load(template: string = this.template()): Promise<void> {
    const request = ++this.request;
    if (this.history() === null) {
      this.status.set('loading');
    }
    try {
      const history = await this.api.history(template);
      if (request === this.request) {
        this.history.set(history);
        this.error.set(null);
        this.status.set('ready');
      }
    } catch (error) {
      if (request === this.request) {
        this.error.set(httpErrorMessage(error, 'L’historique n’a pas pu être lu.'));
        this.status.set('failed');
      }
    }
  }
}
