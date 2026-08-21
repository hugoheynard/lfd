import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ActivityModule } from '@lfd/contracts';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldSpinnerComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { JournalService, type JournalLine } from './journal.service';
import { toLine } from './journal-line';

/** Les modules qui écrivent au journal, plus « tous ». */
const MODULES: FoldSelectOption<string>[] = [
  { value: '', label: 'Tous les modules' },
  { value: 'pim', label: 'Référentiel' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'commandes', label: 'Commandes' },
  { value: 'comptes', label: 'Comptes clients' },
];

/** Les fenêtres de temps proposées, en jours. `0` = depuis toujours. */
const WINDOWS: FoldSelectOption<string>[] = [
  { value: '1', label: 'Dernières 24 h' },
  { value: '7', label: '7 derniers jours' },
  { value: '30', label: '30 derniers jours' },
  { value: '0', label: 'Depuis toujours' },
];

/**
 * Le **journal d'activité** — qui a fait quoi, tous modules confondus.
 *
 * Il existait en écriture seule depuis la croissance : alimenté depuis
 * dix-huit endroits, lu par personne. Cet écran est sa première lecture.
 *
 * Pagination par **curseur** : « Charger la suite » empile, il n'y a pas de
 * numéros de page. Sur un flux append-only lu du plus récent au plus ancien,
 * une page 2 changerait de contenu entre deux clics.
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
    FoldPageLayoutComponent,
    FoldSpinnerComponent,
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

  protected readonly lines = signal<readonly JournalLine[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Vrai quand on sait qu'il reste de la matière sous la dernière ligne. */
  protected readonly hasMore = computed(() => this.nextBefore() !== null);

  constructor() {
    void this.reload();
  }

  /** Un filtre change → on repart du haut : le curseur d'avant ne veut plus rien dire. */
  protected onModule(value: string | null): void {
    this.module.set(value ?? '');
    void this.reload();
  }

  protected onWindow(value: string | null): void {
    this.windowDays.set(value ?? '0');
    void this.reload();
  }

  protected async reload(): Promise<void> {
    await this.fetch(undefined, true);
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.nextBefore();
    if (cursor !== null) {
      await this.fetch(cursor, false);
    }
  }

  private async fetch(before: string | undefined, replace: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Des variables locales, et non les appels répétés dans le ternaire :
      // sous `exactOptionalPropertyTypes`, TS ne narrow pas à travers un second
      // appel, et la clé repart avec un `| undefined` que la cible refuse.
      const module = this.moduleFilter();
      const since = this.sinceFilter();
      const page = await this.journal.page({
        ...(module === undefined ? {} : { module }),
        ...(since === undefined ? {} : { since }),
        ...(before === undefined ? {} : { before }),
      });
      const fresh = page.events.map(toLine);
      this.lines.set(replace ? fresh : [...this.lines(), ...fresh]);
      this.nextBefore.set(page.nextBefore);
    } catch {
      this.error.set('Journal illisible — API injoignable, ou droit manquant.');
    } finally {
      this.loading.set(false);
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

/** Le `<select>` rend une chaîne ; seules ces quatre valeurs sont des modules. */
function asModule(value: string): ActivityModule | undefined {
  const known: readonly ActivityModule[] = ['pim', 'commercial', 'commandes', 'comptes'];
  return known.find((module) => module === value);
}
