import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  FloorClientele,
  PriceFloorView,
  PriceScopePayload,
  PricingBoardView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
  type FoldSelectOptionGroup,
  type FoldTableColumn,
  type FoldViewToggleOption,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  ArchivePanel,
  type ArchivePanelData,
} from '../../b2b/tarification/archive-panel/archive-panel';
import { dynamicFloorLabel, floorLabel } from '../../b2b/tarification/pricing-format';
import { TarificationService } from '../../b2b/tarification/tarification.service';
import { PriceLimitsService } from '../price-limits.service';
import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';

const CLIENTELES: readonly FoldViewToggleOption[] = [
  { value: 'pro', label: 'Pro' },
  { value: 'public', label: 'Public' },
];

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'scope', label: 'Portée' },
  { key: 'value', label: 'Limite' },
  { key: 'door', label: 'Porte dynamique' },
  { key: 'state', label: 'État' },
];

/** L'ordre de lecture : ce dont tout hérite, puis les familles, puis les articles. */
const SCOPE_ORDER: Readonly<Record<PriceScopePayload['type'], number>> = {
  global: 0,
  category: 1,
  product: 2,
  variant: 3,
};

const GLOBAL_KEY = 'global:';

/** Ce que l'écran sait d'une cible : son nom, et d'où elle hérite. */
interface ScopeTarget {
  readonly scope: PriceScopePayload;
  readonly name: string;
  /** La portée dont elle hérite quand elle n'a pas de limite à elle. */
  readonly parentKey: string | null;
  readonly canonicalMillicents: number | null;
}

/**
 * **Comptabilité › Limites de prix** — sous quel prix on ne descend pas, pour
 * les pros et pour le public.
 *
 * La colonne « Limites » de la Tarification B2B, déménagée : les limites
 * relèvent de `lfc_price_limits`, que le commercial n'a pas
 * (`documentation/comptabilite/plan-limites-de-prix.md` §6). Les dialogues sont
 * ceux qu'il utilisait — le panneau de limite, venu avec la vue, et le panneau
 * d'archivage, resté à la Tarification parce que les règles s'en servent.
 *
 * **Les noms viennent du tableau tarifaire.** `PriceLimitsView` ne porte que
 * des portées ; le tableau (`b2b_pricing:read`) nomme les familles et les
 * articles, et dit de quelle famille un article hérite. S'il manque, la vue
 * reste lisible sur les identifiants, et la pose se borne au catalogue.
 */
@Component({
  selector: 'app-limites-de-prix-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './limites-de-prix-page.html',
  styleUrl: './limites-de-prix-page.scss',
})
export class LimitesDePrixPage {
  private readonly limits = inject(PriceLimitsService);
  private readonly tarification = inject(TarificationService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly clienteles = CLIENTELES;
  protected readonly clientele = signal<FloorClientele>('pro');

  protected readonly floors = signal<readonly PriceFloorView[]>([]);
  protected readonly board = signal<PricingBoardView | null>(null);
  protected readonly loading = signal(true);
  /** L'échec de la LECTURE — rien à montrer. */
  protected readonly loadError = signal<string | null>(null);
  /** L'échec d'un GESTE — la liste reste à l'écran. */
  protected readonly actionError = signal<string | null>(null);
  /** Le tableau tarifaire n'a pas pu être lu : les noms manquent, pas les limites. */
  protected readonly boardError = signal<string | null>(null);

  /** La portée choisie pour une pose — une clé `type:id`. */
  protected readonly chosenScope = signal<string>(GLOBAL_KEY);

  protected readonly floorLabel = floorLabel;
  protected readonly dynamicFloorLabel = dynamicFloorLabel;

  /** Les gestes demandent `lfc_price_limits:write` ; sans lui, la liste se lit seulement. */
  protected readonly canWrite = computed(() => this.permissions.can('lfc_price_limits:write'));

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );

  /** Global, puis familles, puis articles — l'ordre de l'héritage. */
  protected readonly sorted = computed(() =>
    [...this.floors()].sort((a, b) => SCOPE_ORDER[a.scope.type] - SCOPE_ORDER[b.scope.type]),
  );

  /** Toutes les cibles connues, par clé — le catalogue, les familles, les articles. */
  private readonly targets = computed(() => {
    const byKey = new Map<string, ScopeTarget>();
    byKey.set(GLOBAL_KEY, {
      scope: { type: 'global', id: null },
      name: 'Tout le catalogue',
      parentKey: null,
      canonicalMillicents: null,
    });
    for (const category of this.board()?.categories ?? []) {
      const categoryScope: PriceScopePayload = { type: 'category', id: category.id };
      byKey.set(scopeKey(categoryScope), {
        scope: categoryScope,
        name: category.name,
        parentKey: GLOBAL_KEY,
        canonicalMillicents: null,
      });
      for (const item of category.items) {
        const itemScope: PriceScopePayload = { type: 'product', id: item.sku };
        byKey.set(scopeKey(itemScope), {
          scope: itemScope,
          name: item.name,
          parentKey: scopeKey(categoryScope),
          canonicalMillicents: item.canonicalMillicents,
        });
      }
    }
    return byKey;
  });

  /** Le choix de la portée à poser, groupé comme le catalogue. */
  protected readonly scopeOptions = computed(() => {
    const groups: FoldSelectOptionGroup<string>[] = [
      { label: 'Catalogue', options: [{ value: GLOBAL_KEY, label: 'Tout le catalogue' }] },
    ];
    for (const category of this.board()?.categories ?? []) {
      groups.push({
        label: category.name,
        options: [
          {
            value: scopeKey({ type: 'category', id: category.id }),
            label: `Famille ${category.name}`,
          },
          ...category.items.map((item) => ({
            value: scopeKey({ type: 'product', id: item.sku }),
            label: `${item.name} · ${item.sku}`,
          })),
        ],
      });
    }
    return groups;
  });

  protected readonly rowKey = (floor: PriceFloorView): string => floor.id;

  constructor() {
    void this.load();
    void this.loadBoard();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const view = await this.limits.list(this.clientele());
      // La clientèle RENDUE fait foi : une réponse lente d'avant la bascule ne
      // doit pas s'afficher sous l'autre segment.
      if (view.clientele === this.clientele()) {
        this.floors.set(view.floors);
      }
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les limites sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected setClientele(value: string): void {
    const next: FloorClientele = value === 'public' ? 'public' : 'pro';
    if (next === this.clientele()) {
      return;
    }
    this.clientele.set(next);
    this.floors.set([]);
    void this.load();
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par des méthodes qui
  // rendent la ligne typée.
  protected targetOf(floor: PriceFloorView): string {
    return this.targets().get(scopeKey(floor.scope))?.name ?? floor.scope.id ?? 'Tout le catalogue';
  }

  protected scopeKindOf(floor: PriceFloorView): string {
    return SCOPE_KIND_LABELS[floor.scope.type];
  }

  protected doorOf(floor: PriceFloorView): string | null {
    return dynamicFloorLabel(floor);
  }

  protected isStale(floor: PriceFloorView): boolean {
    return floor.drift?.stale === true;
  }

  /** Poser sur la portée choisie — ou la modifier, si elle en porte déjà une. */
  protected pose(): void {
    const target = this.targets().get(this.chosenScope());
    if (target !== undefined) {
      void this.openFloor(target.scope);
    }
  }

  protected edit(floor: PriceFloorView): void {
    void this.openFloor(floor.scope);
  }

  protected async confirm(floor: PriceFloorView): Promise<void> {
    this.actionError.set(null);
    try {
      await this.limits.confirmFloor(floor.scope, this.clientele());
      await this.load();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "La limite n'a pas pu être confirmée."));
    }
  }

  protected async retire(floor: PriceFloorView): Promise<void> {
    const target = this.targetOf(floor);
    const data: ArchivePanelData = {
      subject: { kind: 'floor', scope: floor.scope, clientele: this.clientele() },
      target,
      summary: `Limite sur ${target} — ${floorLabel(floor)}`,
    };
    const done = await this.panels.open<ArchivePanelData, boolean>(ArchivePanel, {
      data,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.load();
    }
  }

  private async openFloor(scope: PriceScopePayload): Promise<void> {
    const key = scopeKey(scope);
    const target = this.targets().get(key);
    const data: FloorPanelData = {
      scope,
      clientele: this.clientele(),
      target: target?.name ?? scope.id ?? 'tout le catalogue',
      current: this.floorAt(key),
      inherited: this.inheritedAt(key),
      canonicalMillicents: target?.canonicalMillicents ?? null,
    };
    const done = await this.panels.open<FloorPanelData | undefined, boolean>(FloorPanel, {
      data,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.load();
    }
  }

  private floorAt(key: string): PriceFloorView | null {
    return this.floors().find((floor) => scopeKey(floor.scope) === key) ?? null;
  }

  /** Celle qui s'applique aujourd'hui : la sienne, ou la première en remontant. */
  private inheritedAt(key: string): PriceFloorView | null {
    let cursor: string | null = key;
    while (cursor !== null) {
      const found = this.floorAt(cursor);
      if (found !== null) {
        return found;
      }
      cursor = this.targets().get(cursor)?.parentKey ?? null;
    }
    return null;
  }

  /**
   * Le tableau ne sert qu'à NOMMER. Son absence n'empêche rien de lire : la
   * liste s'affiche sur les identifiants, et la pose se borne au catalogue.
   */
  private async loadBoard(): Promise<void> {
    try {
      this.board.set(await this.tarification.read());
    } catch (caught) {
      this.boardError.set(
        httpErrorMessage(caught, 'Les noms des familles et des articles sont illisibles.'),
      );
    }
  }
}

const SCOPE_KIND_LABELS: Readonly<Record<PriceScopePayload['type'], string>> = {
  global: 'Catalogue',
  category: 'Famille',
  product: 'Article',
  variant: 'Déclinaison',
};

function scopeKey(scope: PriceScopePayload): string {
  return `${scope.type}:${scope.id ?? ''}`;
}
