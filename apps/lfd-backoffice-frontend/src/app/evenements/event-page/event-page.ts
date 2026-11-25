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
import { Router } from '@angular/router';
import type { EventDetailView, ReviseEventPayload } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { applicationsLabel, eventDayLabel } from '../event-format';
import { EventsService } from '../events.service';
import { FunctionSheetsCard } from '../function-sheets-card/function-sheets-card';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Un événement** (`documentation/evenements/plan-evenements.md`, E1–E2) — son
 * nom et sa date, modifiables, et ses fiches de fonction. Un événement archivé
 * ne bouge plus : le serveur le refuse, l'écran ne le propose pas.
 */
@Component({
  selector: 'app-event-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FunctionSheetsCard,
  ],
  templateUrl: './event-page.html',
  styleUrl: './event-page.scss',
})
export class EventPage {
  private readonly api = inject(EventsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);

  /** Le segment `:id` de la route. */
  readonly id = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly event = signal<EventDetailView | null>(null);
  /** La saisie — publique pour que la spec joue la modification sans le DOM de fold. */
  readonly draftName = signal('');
  readonly draftDate = signal('');
  protected readonly saving = signal(false);

  protected readonly archived = computed(() => this.event()?.archivedAt != null);
  protected readonly editable = computed(
    () => this.permissions.can('events:write') && !this.archived(),
  );
  protected readonly title = computed(() => this.event()?.name ?? 'Événement');
  protected readonly subtitle = computed(() => {
    const event = this.event();
    return event === null
      ? ''
      : `${eventDayLabel(event.date)} · ${applicationsLabel(event.applications)}`;
  });

  /** Ce qui a changé par rapport à l'événement lu — `null` si rien, ou un nom vide. */
  protected readonly revision = computed<ReviseEventPayload | null>(() => {
    const event = this.event();
    const name = this.draftName().trim();
    const date = this.draftDate();
    if (event === null || name === '' || date === '') {
      return null;
    }
    const payload: { name?: string; date?: string } = {};
    if (name !== event.name) payload.name = name;
    if (date !== event.date) payload.date = date;
    return Object.keys(payload).length === 0 ? null : payload;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  async reload(): Promise<void> {
    await this.load(this.id());
  }

  /** Relit le détail sans repasser par le chargement : les fiches changent, la page reste. */
  protected async refresh(): Promise<void> {
    try {
      this.apply(await this.api.detail(this.id()));
    } catch (error) {
      this.notify.error(error, 'L’événement n’a pas pu être relu.');
    }
  }

  protected async save(): Promise<void> {
    const payload = this.revision();
    if (payload === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.api.revise(this.id(), payload);
      this.notify.success('Événement enregistré.');
      await this.refresh();
    } catch (error) {
      this.notify.refused(error, 'L’événement n’a pas pu être enregistré.');
    } finally {
      this.saving.set(false);
    }
  }

  /** Archiver : rejouable côté serveur, puis retour à la table. */
  async archive(): Promise<void> {
    try {
      await this.api.archive(this.id());
      this.notify.success('Événement archivé.');
      await this.router.navigate(['/evenements']);
    } catch (error) {
      this.notify.refused(error, 'L’événement n’a pas pu être archivé.');
    }
  }

  private async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      this.apply(await this.api.detail(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  private apply(event: EventDetailView): void {
    this.event.set(event);
    this.draftName.set(event.name);
    this.draftDate.set(event.date);
  }
}
