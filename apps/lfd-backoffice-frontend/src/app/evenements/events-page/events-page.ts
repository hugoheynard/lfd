import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EventSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { GestureIntents } from '../../shared/gesture-intents';
import { parisToday } from '../../shared/paris-today';
import { applicationsLabel, eventDayLabel } from '../event-format';
import { EventsService } from '../events.service';

type LoadState = 'loading' | 'error' | 'ready';

const COLUMNS: readonly FoldTableColumn<EventSummaryView>[] = [
  { key: 'name', label: 'Nom', value: (row) => row.name },
  { key: 'date', label: 'Date', value: (row) => eventDayLabel(row.date) },
  {
    key: 'applications',
    label: 'Applications',
    value: (row) => applicationsLabel(row.applications),
  },
  { key: 'sheets', label: 'Fiches', numeric: true, value: (row) => row.functionSheetCount },
];

/** Le sujet de l'intention de créer : un seul popover, un seul geste à la fois. */
const CREATE_SUBJECT = 'create-event';

/**
 * **Les événements** (`documentation/evenements/plan-evenements.md`, E1) — la
 * table, et « Créer un événement » dans un popover (nom + date) qui mène au
 * détail une fois créé.
 */
@Component({
  selector: 'app-events-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './events-page.html',
  styleUrl: './events-page.scss',
})
export class EventsPage {
  private readonly api = inject(EventsService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: EventSummaryView): string => row.id;

  protected readonly state = signal<LoadState>('loading');
  protected readonly events = signal<readonly EventSummaryView[]>([]);
  protected readonly canWrite = computed(() => this.permissions.can('events:write'));

  protected readonly createOpen = signal(false);
  /** Le popover — publics pour que la spec joue le geste sans le DOM projeté. */
  readonly draftName = signal('');
  readonly draftDate = signal(parisToday());
  protected readonly creating = signal(false);
  protected readonly canCreate = computed(
    () => this.draftName().trim() !== '' && this.draftDate() !== '' && !this.creating(),
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.state.set('loading');
    try {
      this.events.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected open(row: EventSummaryView): void {
    void this.router.navigate(['/evenements', row.id]);
  }

  async create(): Promise<void> {
    if (!this.canCreate()) {
      return;
    }
    this.creating.set(true);
    try {
      const created = await this.api.create(
        { name: this.draftName().trim(), date: this.draftDate() },
        this.intents.keyFor(CREATE_SUBJECT),
      );
      this.intents.done(CREATE_SUBJECT);
      this.createOpen.set(false);
      this.draftName.set('');
      await this.router.navigate(['/evenements', created.id]);
    } catch (error) {
      this.notify.refused(error, 'L’événement n’a pas pu être créé.');
    } finally {
      this.creating.set(false);
    }
  }
}
