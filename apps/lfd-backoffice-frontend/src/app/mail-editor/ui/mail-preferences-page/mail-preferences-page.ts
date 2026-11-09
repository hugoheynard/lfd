import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  MAIL_PREFERENCE_STATUSES,
  MAIL_SEND_SPACES,
  type MailPreferenceListItemView,
  type MailPreferenceSearchView,
  type MailPreferenceStatus,
  type MailSendSpace,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldSelectOption,
  type FoldTableEmpty,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailPreferencesService } from '../../data/mail-preferences.service';
import {
  MAIL_PREFERENCE_STATUS_LABELS,
  NO_MAIL_PREFERENCE_FILTERS,
  type MailPreferenceFilters,
} from '../../rules/mail-preference-labels';
import {
  MailPreferencePanel,
  type MailPreferencePanelData,
  type MailPreferencePanelResult,
} from '../mail-preference-panel/mail-preference-panel';
import { MailPreferencesTable } from '../mail-preferences-table/mail-preferences-table';
import { mailSendWhen } from '../../rules/mail-send-labels';
import { MailSendsTabs } from '../mail-sends-tabs/mail-sends-tabs';
import { MailUnsubscribeAddressPanel } from '../mail-unsubscribe-address-panel/mail-unsubscribe-address-panel';

const NOTHING_LISTED: FoldTableEmpty = {
  title: 'Aucune ligne ne correspond',
  subtitle: 'Personne ne s’est encore inscrit ni désinscrit, ou les filtres écartent tout.',
};
const NOTHING_FOUND: FoldTableEmpty = {
  title: 'Aucune ligne pour cette adresse',
  subtitle: 'Elle n’a jamais été inscrite ni désinscrite d’aucun espace.',
};

/**
 * **Les désinscriptions et accords** (doc `la-desinscription-et-l-accord.md`,
 * règle 8, lot C4), onglet du suivi sous le droit `mail_sends` : le registre
 * de préférence marketing par espace — état, origine, lieu, dates —, adresse
 * masquée, filtrable par espace et par état, page par page (curseur du
 * serveur). Une ligne s'ouvre en panneau : sa preuve, « Afficher l'adresse »
 * (révélation tracée du suivi), « Désinscrire à la demande du client ».
 *
 * La recherche par adresse remplace la liste par un résultat FIGÉ à
 * l'instant de la recherche (le serveur le garde 5 minutes, à son seul
 * auteur) ; l'adresse ne quitte le champ que par le corps d'un `POST`.
 * Après une désinscription, la liste est relue : le résultat figé reste tel
 * qu'il a été trouvé, jusqu'à « Revenir à la liste ».
 */
@Component({
  selector: 'app-mail-preferences-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    MailPreferencesTable,
    MailSendsTabs,
  ],
  templateUrl: './mail-preferences-page.html',
  styleUrl: './mail-preferences-page.scss',
})
export class MailPreferencesPage {
  private readonly api = inject(MailPreferencesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  protected readonly canSeeTemplates = computed(() => this.permissions.can('mail_templates:read'));
  protected readonly canWrite = computed(() => this.permissions.can('mail_sends:write'));

  protected readonly spaceOptions: readonly FoldSelectOption<MailSendSpace>[] =
    MAIL_SEND_SPACES.map((space) => ({ value: space, label: MAIL_SPACE_LABELS[space] }));
  protected readonly statusOptions: readonly FoldSelectOption<MailPreferenceStatus>[] =
    MAIL_PREFERENCE_STATUSES.map((status) => ({
      value: status,
      label: MAIL_PREFERENCE_STATUS_LABELS[status],
    }));

  protected readonly filters = signal<MailPreferenceFilters>(NO_MAIL_PREFERENCE_FILTERS);
  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly items = signal<readonly MailPreferenceListItemView[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly moreError = signal<string | null>(null);

  protected readonly address = signal('');
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly search = signal<MailPreferenceSearchView | null>(null);

  protected readonly rows = computed(() => this.search()?.items ?? this.items());
  protected readonly empty = computed(() =>
    this.search() === null ? NOTHING_LISTED : NOTHING_FOUND,
  );
  protected readonly frozenAt = computed(() => {
    const search = this.search();
    return search === null ? '' : mailSendWhen(search.searchedAt);
  });

  /** Écarte la réponse d'une lecture dépassée par un changement de filtres. */
  private generation = 0;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const generation = ++this.generation;
    this.status.set('loading');
    this.moreError.set(null);
    try {
      const page = await this.api.list(this.filters());
      if (generation !== this.generation) return;
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.status.set('ready');
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(httpErrorMessage(error, 'Le registre n’a pas pu être lu.'));
      this.status.set('failed');
    }
  }

  protected change(patch: Partial<MailPreferenceFilters>): void {
    this.filters.update((filters) => ({ ...filters, ...patch }));
    void this.load();
  }

  /** La page suivante s'ajoute ; un échec le dit sans retirer ce qui est affiché. */
  protected async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore()) return;
    const generation = this.generation;
    this.loadingMore.set(true);
    this.moreError.set(null);
    try {
      const page = await this.api.list(this.filters(), cursor);
      if (generation !== this.generation) return;
      this.items.update((items) => [...items, ...page.items]);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      this.moreError.set(httpErrorMessage(error, 'La suite de la liste n’a pas pu être lue.'));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected async searchAddress(event: Event): Promise<void> {
    event.preventDefault();
    const address = this.address().trim();
    if (address === '' || this.searching()) return;
    this.searching.set(true);
    this.searchError.set(null);
    try {
      this.search.set(await this.api.searchByAddress(address));
    } catch (error) {
      this.searchError.set(httpErrorMessage(error, 'La recherche n’a pas pu aboutir.'));
    } finally {
      this.searching.set(false);
    }
  }

  /** Revient à la liste ; l'adresse quitte aussi le champ. */
  protected leaveSearch(): void {
    this.search.set(null);
    this.searchError.set(null);
    this.address.set('');
  }

  protected async open(row: MailPreferenceListItemView): Promise<void> {
    const ref = this.panels.open<MailPreferencePanelData, MailPreferencePanelResult>(
      MailPreferencePanel,
      { data: { id: row.id } },
    );
    if ((await ref.closed) === 'changed') await this.load();
  }

  protected async unsubscribeAddress(): Promise<void> {
    const ref = this.panels.open<MailPreferencePanelResult>(MailUnsubscribeAddressPanel);
    if ((await ref.closed) === 'changed') await this.load();
  }
}
