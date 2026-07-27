import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

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

import {
  boutiquesWith,
  FISCAL_CATEGORIES,
  FISCAL_LABELS,
  tvaFor,
} from '../../data/channels';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import {
  CatalogueApi,
  type Category,
  type FiscalCategory,
  type SalesChannels,
} from '../catalogue-api';

/**
 * Catégories (= familles = gammes). Chaque catégorie porte les **défauts de
 * canaux** et le **régime de TVA** dont héritent ses produits. Composants fold ;
 * l'unique `<input>` natif est l'éditeur en cellule (commit on blur).
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  protected readonly draftName = signal('');
  protected readonly draftParent = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected readonly fiscalCategories = FISCAL_CATEGORIES;

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'tva', label: 'TVA' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '13rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucune catégorie',
    subtitle: 'Commencez par « Viennoiseries ».',
  };

  protected readonly rowKey = (category: Category): string => category.id;

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

  protected fiscalLabel(fiscal: FiscalCategory): string {
    return FISCAL_LABELS[fiscal];
  }

  /** « 5,5 % · 10 % » — à emporter puis sur place. */
  protected ratesOf(fiscal: FiscalCategory): string {
    const rates = tvaFor(fiscal);
    return `${rates.emporter} · ${rates.surPlace}`;
  }

  protected presetEmporter(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'emporter');
  }

  protected presetSurPlace(category: Category): string[] {
    return boutiquesWith(category.channelPreset, 'surPlace');
  }

  protected isPatisserie(category: Category): boolean {
    return category.fiscalCategory === 'patisserie';
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

  protected async onFiscal(
    category: Category,
    fiscal: FiscalCategory,
  ): Promise<void> {
    await this.run(() => this.api.setCategoryFiscal(category.id, fiscal));
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
      this.categories.set(await this.api.listCategories());
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}
