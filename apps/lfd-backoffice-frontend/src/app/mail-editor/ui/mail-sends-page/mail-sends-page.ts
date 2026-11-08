import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { MailRecipientSearchView, MailSendListItemView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableEmpty,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailSendsService } from '../../data/mail-sends.service';
import {
  mailSendWhen,
  NO_MAIL_SEND_FILTERS,
  type MailSendFilters as Filters,
} from '../../rules/mail-send-labels';
import { MailSendFilters } from '../mail-send-filters/mail-send-filters';
import { MailSendPanel, type MailSendPanelData } from '../mail-send-panel/mail-send-panel';
import { MailSendsTable } from '../mail-sends-table/mail-sends-table';

const NOTHING_LISTED: FoldTableEmpty = {
  title: 'Aucun envoi ne correspond',
  subtitle: 'Effacez les filtres pour revoir tous les envois.',
};
const NOTHING_FOUND: FoldTableEmpty = {
  title: 'Aucun envoi pour cette adresse',
  subtitle: 'L’adresse est comparée en minuscules, telle qu’écrite.',
};

/**
 * **Le suivi des envois** (`le-suivi-des-e-mails.md`, lot T3), sous le
 * droit `mail_sends` : chaque e-mail demandé, son état et le retour de
 * Resend, les problèmes d'abord (ordre du serveur), filtrables, page par
 * page (« Charger plus », curseur du serveur).
 *
 * La recherche par adresse remplace la liste par un résultat FIGÉ à
 * l'instant de la recherche (le serveur le garde 5 minutes, à son seul
 * auteur) ; l'adresse ne quitte le champ que par le corps d'un `POST` —
 * jamais l'URL, jamais l'état de route. Un refus (plafond horaire `409`)
 * s'affiche tel que le serveur le dit, la liste reste.
 *
 * `?envoi=<id>` ouvre d'emblée le détail de cet envoi : c'est l'adresse
 * qu'une fiche commande donne à chacun de ses e-mails
 * (`plan-sujet-des-e-mails.md`, lot E3).
 */
@Component({
  selector: 'app-mail-sends-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    MailSendFilters,
    MailSendsTable,
  ],
  templateUrl: './mail-sends-page.html',
  styleUrl: './mail-sends-page.scss',
})
export class MailSendsPage {
  private readonly api = inject(MailSendsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  /** Le retour vers les modèles ne se montre qu'à qui peut les lire. */
  protected readonly canSeeTemplates = computed(() => this.permissions.can('mail_templates:read'));

  protected readonly filters = signal<Filters>(NO_MAIL_SEND_FILTERS);
  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly items = signal<readonly MailSendListItemView[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly moreError = signal<string | null>(null);

  protected readonly address = signal('');
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly search = signal<MailRecipientSearchView | null>(null);

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
    const asked = inject(ActivatedRoute).snapshot.queryParamMap.get('envoi');
    if (asked !== null && asked !== '') {
      this.panels.open<MailSendPanelData>(MailSendPanel, { data: { id: asked } });
    }
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
      this.error.set(httpErrorMessage(error, 'Les envois n’ont pas pu être lus.'));
      this.status.set('failed');
    }
  }

  protected changeFilters(filters: Filters): void {
    this.filters.set(filters);
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
      this.search.set(await this.api.searchByRecipient(address));
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

  protected open(row: MailSendListItemView): void {
    this.panels.open<MailSendPanelData>(MailSendPanel, { data: { id: row.id } });
  }
}
