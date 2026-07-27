import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { boutiquesWith, formatPercent } from '../../data/channels';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import {
  CatalogueApi,
  type Category,
  type SalesChannels,
  type TvaRegime,
} from '../catalogue-api';

/**
 * Catégories (= familles = gammes). Chaque catégorie porte les **défauts de
 * canaux** et les **régimes de TVA** (à emporter / sur place) dont héritent ses
 * produits. Composants fold ; l'unique `<input>` natif est l'éditeur en cellule.
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    ChannelMatrix,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly api = inject(CatalogueApi);

  protected readonly categories = signal<Category[]>([]);
  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly draftName = signal('');
  protected readonly draftParent = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'tva', label: 'TVA (emporter → sur place)' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '13rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucune catégorie',
    subtitle: 'Commencez par « Viennoiseries ».',
  };

  protected readonly rowKey = (category: Category): string => category.id;

  private readonly regimeById = computed(
    () => new Map(this.regimes().map((regime) => [regime.id, regime])),
  );

  /** La catégorie en cours de réglage. */
  protected readonly selected = computed<Category | null>(() => {
    const id = this.editingId();
    if (id === null) {
      return null;
    }
    return this.categories().find((c) => c.id === id) ?? null;
  });

  constructor() {
    void this.reload();
  }

  protected activeCategories(): Category[] {
    return this.categories().filter((category) => !category.isArchived);
  }

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    const parent = this.categories().find(
      (item) => item.id === category.parentId,
    );
    return parent?.name.fr ?? '—';
  }

  /** Libellé d'un régime : « Réduit · 5,5 % ». */
  protected regimeLabel(regime: TvaRegime): string {
    return `${regime.name} · ${formatPercent(regime.percent)}`;
  }

  protected rateOf(regimeId: string): string {
    const regime = this.regimeById().get(regimeId);
    return regime === undefined ? '—' : formatPercent(regime.percent);
  }

  protected presetEmporter(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'emporter');
  }

  protected presetSurPlace(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'surPlace');
  }

  /** Alerte de démo : la pâtisserie a des cas tva-a-valider (cf. doc §3). */
  protected isPatisserie(category: Category): boolean {
    return category.slug.fr.includes('patisser');
  }

  protected editGamme(category: Category): void {
    this.editingId.set(category.id);
  }

  protected closeEditor(): void {
    this.editingId.set(null);
  }

  protected async onPreset(
    category: Category,
    channels: SalesChannels,
  ): Promise<void> {
    await this.run(() =>
      this.api.setCategoryChannelPreset(category.id, channels),
    );
  }

  protected async onEmporterTva(
    category: Category,
    regimeId: string,
  ): Promise<void> {
    await this.run(() =>
      this.api.setCategoryTva(category.id, regimeId, category.surPlaceTvaId),
    );
  }

  protected async onSurPlaceTva(
    category: Category,
    regimeId: string,
  ): Promise<void> {
    await this.run(() =>
      this.api.setCategoryTva(category.id, category.emporterTvaId, regimeId),
    );
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.value : '';
  }

  protected async create(): Promise<void> {
    const nameFr = this.draftName().trim();
    if (nameFr === '') {
      return;
    }
    const parentId = this.draftParent();
    await this.run(async () => {
      await this.api.createCategory(
        parentId === '' ? { nameFr } : { nameFr, parentId },
      );
      this.draftName.set('');
    });
  }

  protected async rename(category: Category, nameFr: string): Promise<void> {
    if (nameFr.trim() === '' || nameFr === category.name.fr) {
      return;
    }
    await this.run(() => this.api.renameCategory(category.id, nameFr));
  }

  protected async archive(category: Category): Promise<void> {
    await this.run(() => this.api.archiveCategory(category.id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [categories, regimes] = await Promise.all([
        this.api.listCategories(),
        this.api.listTvaRegimes(),
      ]);
      this.categories.set(categories);
      this.regimes.set(regimes);
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}
