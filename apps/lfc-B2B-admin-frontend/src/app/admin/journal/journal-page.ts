import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { ActivityModule, ActivityPageView } from '@lfd/contracts';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldSearchComponent,
  type FoldPaginatorLabels,
  type FoldSelectOption,
} from 'fold-ng';

import { JournalService, type JournalLine } from './journal.service';
import { MODULE_LABELS, toLine } from './journal-line';

/**
 * Les modules qui écrivent au journal, plus « tous ». Dérivés des libellés du
 * badge : le filtre et la ligne disent le même mot.
 */
const MODULES: FoldSelectOption<string>[] = [
  { value: '', label: 'Tous les modules' },
  ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label })),
];

/** Les fenêtres de temps proposées, en jours. `0` = depuis toujours. */
const WINDOWS: FoldSelectOption<string>[] = [
  { value: '1', label: 'Dernières 24 h' },
  { value: '7', label: '7 derniers jours' },
  { value: '30', label: '30 derniers jours' },
  { value: '0', label: 'Depuis toujours' },
];

/**
 * En deçà, une lettre ramènerait presque tout le journal : le terme ne part
 * pas, et le serveur le refuserait de toute façon (`q` : 2 caractères minimum).
 */
const MIN_QUERY_LENGTH = 2;

/** Cinquante faits par page : ce que le curseur empilait à chaque « suite ». */
const PAGE_SIZE = 50;

/** Le paginator parle anglais par défaut ; cet écran, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Faits par page',
  perPage: 'par page',
  nav: 'Pagination du journal',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucun fait',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/**
 * Le **journal d'activité** — qui a fait quoi, tous modules confondus.
 *
 * Il existait en écriture seule depuis la croissance : alimenté depuis
 * dix-huit endroits, lu par personne. Cet écran est sa première lecture.
 *
 * Pagination par **numéros de page**, sur une **vue figée** : la page 1 part
 * sans ancre et la réponse rend `asOf` — le fait le plus récent qu'elle a vu —,
 * que les pages suivantes renvoient. Sans elle, sur un flux append-only lu du
 * plus récent au plus ancien, une page 2 changerait de contenu entre deux clics.
 *
 * Un fait arrivé depuis n'apparaît donc qu'en revenant à la page 1, ou en
 * changeant de filtre ou de recherche : chacun de ces gestes ouvre une vue
 * neuve. L'écran le dit sous la liste dès qu'on a quitté la page 1.
 */
@Component({
  selector: 'app-journal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPaginatorComponent,
    FoldSearchComponent,
  ],
  templateUrl: './journal-page.html',
  styleUrl: './journal-page.scss',
})
export class JournalPage {
  private readonly journal = inject(JournalService);

  protected readonly modules = MODULES;
  protected readonly windows = WINDOWS;

  protected readonly module = signal('');
  protected readonly windowDays = signal('7');
  /** Le terme effectivement envoyé — vide tant qu'il fait moins de deux caractères. */
  protected readonly query = signal('');

  protected readonly lines = signal<readonly JournalLine[]>([]);
  /** La page affichée — celle que le serveur a rendue. */
  protected readonly page = signal(1);
  /** Les faits de la vue figée qui répondent aux filtres. */
  protected readonly total = signal(0);
  /** « 14:32 » — l'heure à laquelle la page 1 a figé la vue. */
  protected readonly frozenAt = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly paginatorLabels = PAGINATOR_LABELS;

  /** L'ancre de la vue parcourue, rendue par la page 1. */
  private asOf: string | null = null;

  /**
   * Numéro de la dernière lecture lancée. Une réponse plus ancienne qui arrive
   * après est jetée : sans ça, taper « mart » puis « martin » pouvait afficher
   * les résultats de « mart » sous le champ qui dit « martin ».
   */
  private requestSeq = 0;

  constructor() {
    void this.reload();
  }

  /** Un filtre change → vue neuve, page 1 sans ancre : l'ancienne ne répondait pas à ces filtres. */
  protected onModule(value: string | null): void {
    this.module.set(value ?? '');
    void this.reload();
  }

  protected onWindow(value: string | null): void {
    this.windowDays.set(value ?? '0');
    void this.reload();
  }

  /**
   * `fold-search` rend le terme déjà trimé, après 300 ms de calme. Un terme
   * trop court vaut « pas de recherche » ; on ne relit que si ce qui part change.
   */
  protected onSearch(term: string): void {
    const query = term.length >= MIN_QUERY_LENGTH ? term : '';
    if (query !== this.query()) {
      this.query.set(query);
      void this.reload();
    }
  }

  /** Page 1, sans ancre : une vue neuve, qui montre ce qui est arrivé depuis. */
  protected async reload(): Promise<void> {
    await this.fetch(1, undefined);
  }

  /** La page 1 rouvre une vue neuve ; les autres lisent la vue figée. */
  protected async goTo(page: number): Promise<void> {
    if (page === 1 || this.asOf === null) {
      await this.reload();
      return;
    }
    await this.fetch(page, this.asOf);
  }

  private async fetch(page: number, asOf: string | undefined): Promise<void> {
    const seq = ++this.requestSeq;
    if (asOf === undefined) {
      // Une vue neuve s'ouvre : l'ancre d'avant ne répond plus à ces filtres,
      // même si la lecture échoue.
      this.asOf = null;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      // Des variables locales, et non les appels répétés dans le ternaire :
      // sous `exactOptionalPropertyTypes`, TS ne narrow pas à travers un second
      // appel, et la clé repart avec un `| undefined` que la cible refuse.
      const module = this.moduleFilter();
      const since = this.sinceFilter();
      const q = this.query();
      const view = await this.journal.page({
        ...(module === undefined ? {} : { module }),
        ...(since === undefined ? {} : { since }),
        ...(q === '' ? {} : { q }),
        page,
        ...(asOf === undefined ? {} : { asOf }),
        limit: PAGE_SIZE,
      });
      if (seq !== this.requestSeq) {
        return;
      }
      this.show(view, page, asOf === undefined);
    } catch {
      if (seq === this.requestSeq) {
        this.error.set('Journal illisible — API injoignable, ou droit manquant.');
      }
    } finally {
      if (seq === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  /**
   * `page` vaut `null` dans le contrat pour une lecture par curseur, que cet
   * écran ne fait plus : le numéro demandé reste alors le bon.
   */
  private show(view: ActivityPageView, requested: number, fresh: boolean): void {
    this.lines.set(view.events.map(toLine));
    this.page.set(view.page ?? requested);
    this.total.set(view.total);
    this.asOf = view.asOf;
    if (fresh) {
      this.frozenAt.set(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      );
    }
  }

  private moduleFilter(): ActivityModule | undefined {
    const value = this.module();
    return value === '' ? undefined : asModule(value);
  }

  /** La borne basse, calculée depuis la fenêtre choisie. `0` = pas de borne. */
  private sinceFilter(): string | undefined {
    const days = Number(this.windowDays());
    if (!Number.isFinite(days) || days <= 0) {
      return undefined;
    }
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
}

/** La liste rend une chaîne ; seules les clés de `MODULE_LABELS` sont des modules. */
function asModule(value: string): ActivityModule | undefined {
  return isModule(value) ? value : undefined;
}

function isModule(value: string): value is ActivityModule {
  return Object.hasOwn(MODULE_LABELS, value);
}
