import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import type { ProductionDisplayView, ProductionGrouping } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { blobRefusalMessage } from '../../shared/download/blob-refusal';
import { ProductionSettingsService } from '../production-settings.service';
import { WorkstationsService } from '../workstations.service';

const MODE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'shelf', label: 'Mode boutique' },
  { value: 'workstation', label: 'Mode prod' },
];

const SUBCATEGORY_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'shown', label: 'Affichées' },
  { value: 'hidden', label: 'Masquées' },
];

/** Le point de départ quand le réglage n'est pas lu, ou n'a pas de rangement : celui d'un fournil neuf. */
const DEFAULT_GROUPING: ProductionGrouping = 'shelf';
const UNREAD_DISPLAY: ProductionDisplayView = {
  showSubcategories: false,
  grouping: DEFAULT_GROUPING,
};

/**
 * **Simuler le dossier de prod** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.11) : une page dédiée plutôt qu'une simulation par option (décidé par
 * Hugo le 2026-11-17). On choisit le rangement et les sous-catégories,
 * pré-réglés sur le réglage en vigueur, et le serveur rend le PDF ; rien
 * n'est enregistré.
 *
 * Le réglage se lit sous `production_settings`, à part : sans lui, les choix
 * partent du mode boutique sans sous-catégories, et la page le dit. En mode
 * prod sans aucun produit placé, tout ressort « à ranger » — c'est voulu.
 */
@Component({
  selector: 'app-production-simulation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './production-simulation-page.html',
  styleUrl: './production-simulation-page.scss',
})
export class ProductionSimulationPage {
  private readonly settings = inject(ProductionSettingsService);
  private readonly workstations = inject(WorkstationsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly loading = signal(true);
  /** Le réglage n'a pas été lu (droit absent, ou panne) : les choix partent du défaut. */
  protected readonly settingUnread = signal(false);
  protected readonly mode = signal<ProductionGrouping>(DEFAULT_GROUPING);
  protected readonly showSubcategories = signal(UNREAD_DISPLAY.showSubcategories);
  protected readonly subcategoriesValue = computed(() =>
    this.showSubcategories() ? 'shown' : 'hidden',
  );
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly subcategoryOptions = SUBCATEGORY_OPTIONS;

  protected readonly simulating = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** Le navigateur a bloqué l'onglet : un lien de téléchargement à la place. */
  protected readonly blockedPdf = signal<{ url: string; fileName: string } | null>(null);
  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
    void this.preset();
  }

  protected chooseMode(value: string): void {
    this.mode.set(value === 'workstation' ? 'workstation' : 'shelf');
  }

  protected chooseSubcategories(value: string): void {
    this.showSubcategories.set(value === 'shown');
  }

  /** Ouvre le dossier simulé dans un nouvel onglet. */
  protected async simulate(): Promise<void> {
    if (this.simulating()) {
      return;
    }
    this.simulating.set(true);
    this.refusal.set(null);
    this.blockedPdf.set(null);
    const mode = this.mode();
    try {
      const blob = await this.workstations.simulationPdf(mode, this.showSubcategories());
      this.revoke();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      if (window.open(url, '_blank') === null) {
        const fileName = `simulation-${mode === 'shelf' ? 'boutique' : 'prod'}.pdf`;
        this.blockedPdf.set({ url, fileName });
      }
    } catch (error) {
      this.refusal.set(await blobRefusalMessage(error));
    } finally {
      this.simulating.set(false);
    }
  }

  private async preset(): Promise<void> {
    const display = await this.readDisplay();
    this.settingUnread.set(display === null);
    const start = display ?? UNREAD_DISPLAY;
    this.mode.set(start.grouping ?? DEFAULT_GROUPING);
    this.showSubcategories.set(start.showSubcategories);
    this.loading.set(false);
  }

  private async readDisplay(): Promise<ProductionDisplayView | null> {
    if (!this.permissions.can('production_settings:read')) {
      return null;
    }
    try {
      return (await this.settings.settings()).display ?? null;
    } catch {
      return null;
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
