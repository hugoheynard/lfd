import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { CatalogShelfNav, ProductSearch } from '@lfd/b2b-ui/catalog';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResupplyDraftView,
  StockAlertLevel,
  StockAlertView,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { ResupplyQuantityCell } from '../resupply-quantity-cell/resupply-quantity-cell';
import { ResupplyTemplatesMenu } from '../resupply-templates-menu/resupply-templates-menu';
import { SHELF_NAV_LABELS } from '../../../commandes/nouvelle-commande/catalog-shelf-filter';
import {
  ALL_SHELVES,
  resupplyShelfIdOf,
  resupplyShelvesOf,
} from '../../resupply-shelves/resupply-shelves';
import {
  buildStockRows,
  filterStockRows,
  rowStateLabel,
  TARGET_LABELS,
  type StockRow,
} from '../resupply-stock-rows';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { SiteStockAlertsStore } from '../site-stock-alerts.store';
import { UnorderedReceiptEditor } from '../unordered-receipt-editor/unordered-receipt-editor';

const STATE_OPTIONS = [
  { value: 'ok', label: 'OK' },
  { value: 'low', label: 'Faible' },
  { value: 'out_of_stock', label: 'Rupture' },
] as const;

/** Le pas de relecture de l'heure : une minute de retard au plus sur l'heure limite. */
const NOW_POLL_MS = 60_000;

/** Le téléphone — le seuil des feuilles de style de la table et de la case, plus large que l'étroit commun. */
const PHONE_QUERY = '(max-width: 768px)';

/**
 * **La table du réassort** (lot R1e, `reassort-boutiques/README.md`,
 * Hugo 2026-10-21 : « pense comptoir, un clic ») : tous les produits du
 * catalogue publié, leur stock du jour (la somme des reçus réceptionnés),
 * leur état (OK · Faible · Rupture) en un clic, et la demande en cours de
 * chaque visée saisie dans la case. Ruptures et stocks faibles en tête, puis
 * les demandés, puis le reste.
 *
 * Une seule colonne de quantité, parce que deux encombraient la table (lot
 * R1f, Hugo 2026-10-21) : un sélecteur choisit la visée affichée. Par défaut
 * « Pour demain » tant que l'heure limite du réassort n'est pas passée,
 * « Au plus tôt » ensuite ; la demande en cours garde les deux.
 *
 * Elle ne garde rien que le serveur n'ait pas : un état passe par
 * `SiteStockAlertsStore`, une demande par `SiteResuppliesStore` (lot R1c),
 * le reçu sans commande par `UnorderedReceiptEditor` — puis la page relit.
 * La demande de la visée affichée se nomme au-dessus d'« Envoyer », par
 * exemple « Vitrine du matin » (lot R1g).
 */
@Component({
  selector: 'app-resupply-stock-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogShelfNav,
    ProductSearch,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldTimeComponent,
    FoldViewToggleComponent,
    ResupplyNameField,
    ResupplyQuantityCell,
    ResupplyTemplatesMenu,
    SaleQuantityPipe,
    UnorderedReceiptEditor,
  ],
  templateUrl: './resupply-stock-table.html',
  styleUrl: './resupply-stock-table.scss',
})
export class ResupplyStockTable {
  private readonly alerts = inject(SiteStockAlertsStore);
  private readonly resupplies = inject(SiteResuppliesStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly siteId = input.required<string>();
  readonly day = input.required<string>();
  readonly articles = input.required<readonly ResupplyArticleView[]>();
  readonly stock = input.required<readonly ResupplyReceiptLineView[]>();
  readonly unordered = input.required<readonly UnorderedReceiptLineView[]>();
  readonly canWrite = input.required<boolean>();
  /** `resupply_templates:write` : enregistrer et mettre à jour un modèle depuis la demande. */
  readonly canWriteTemplates = input(false);
  /**
   * L'instant qui choisit la visée par défaut, relu chaque minute : il était
   * lu UNE fois, et une table ouverte avant l'heure limite proposait encore
   * « Pour demain » des heures après (audit du 2026-11-03). Le test le pilote
   * par de faux minuteurs.
   */
  protected readonly now = signal(Date.now());
  /** Un reçu sans commande a été écrit : la page relit le stock. */
  readonly changed = output();

  /** En mobile, la case seule, en lecture : la toucher ouvre le dialogue (2026-10-28). */
  protected readonly phone = narrowViewport(PHONE_QUERY);

  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly stateLabel = rowStateLabel;

  /**
   * Le reçu sans commande ne s'écrit que pour AUJOURD'HUI, selon l'horloge du
   * serveur (`SiteResuppliesView.today`) : sur une autre journée de la bande,
   * le serveur refuse (409 `resupply.receipt.unordered_not_today`, audit
   * final du 2026-11-03). Le geste n'est donc pas offert ; sans la vue, non plus.
   */
  protected readonly unorderedOpen = computed(
    () => this.canWrite() && this.resupplies.view()?.today === this.day(),
  );

  /**
   * Le point suit-il l'état de son stock ? Réglé dans Réglages › Comptoir,
   * désactivé par défaut (décidé par Hugo le 2026-11-19) ; faux tant que la
   * vue n'est pas lue. Désactivé, ni « Stock du jour », ni « État », ni
   * teinte : le serveur refuserait de déclarer (409
   * `resupply.stock_tracking.disabled`).
   */
  protected readonly tracking = computed(() => this.resupplies.view()?.stockTracking ?? false);

  /**
   * Les alertes déjà ouvertes d'un point qui ne suit plus son stock : lues,
   * et levées à la main d'un clic (décidé par Hugo le 2026-11-19), comme la
   * réception d'un réassort de l'article les lève aussi.
   */
  protected readonly untrackedAlerts = computed(() =>
    this.tracking()
      ? []
      : this.alerts.alerts().map((alert) => ({
          alert,
          label: `${alert.label} (${rowStateLabel(alert.level)})`,
        })),
  );

  /** Lève une alerte restée ouverte sur un point qui ne suit plus son stock. */
  protected async liftUntracked(alert: StockAlertView): Promise<void> {
    await this.alerts.lift(alert);
  }

  /** Les colonnes ; « Actions » seulement quand le reçu sans commande s'écrit. */
  protected readonly columns = computed<readonly FoldTableColumn<StockRow>[]>(() => [
    { key: 'product', label: 'Produit' },
    ...(this.tracking()
      ? [
          { key: 'stock', label: 'Stock du jour', numeric: true },
          { key: 'state', label: 'État' },
        ]
      : []),
    { key: 'quantity', label: this.targetLabel() },
    ...(this.unorderedOpen()
      ? [{ key: 'actions', label: 'Actions', align: 'right' as const }]
      : []),
  ]);
  protected readonly skuOf = (row: StockRow): string => row.sku;
  /** La rupture en alerte, le stock faible en avertissement — seulement si le point suit son stock. */
  protected readonly toneOf = computed(() =>
    this.tracking()
      ? (row: StockRow): FoldTableTone =>
          row.state === 'out_of_stock' ? 'alert' : row.state === 'low' ? 'warning' : null
      : (): FoldTableTone => null,
  );

  /** La visée choisie d'un clic ; `null` tant que personne n'a cliqué. */
  private readonly chosenTarget = signal<ResupplyTarget | null>(null);

  /**
   * La visée affichée : celle du clic, sinon « Pour demain » tant que
   * l'heure limite (`tomorrowOrderUntil`, résolue par le serveur depuis
   * `resupplyCutoffTime`) n'est pas passée — ou s'il n'y en a pas.
   */
  protected readonly target = computed<ResupplyTarget>(() => {
    const chosen = this.chosenTarget();
    if (chosen !== null) {
      return chosen;
    }
    const until = this.resupplies.view()?.tomorrowOrderUntil ?? null;
    return until === null || this.now() < Date.parse(until) ? 'tomorrow' : 'asap';
  });
  protected readonly targetLabel = computed(() => TARGET_LABELS[this.target()]);

  /** Les deux visées ; l'autre porte son nombre de lignes s'il y en a. */
  protected readonly targetOptions = computed(() =>
    (['asap', 'tomorrow'] as const).map((value) => {
      const count = this.countOf(value);
      const label = TARGET_LABELS[value];
      return {
        value,
        label: value !== this.target() && count > 0 ? `${label} (${String(count)})` : label,
      };
    }),
  );
  protected readonly query = signal('');
  /** Le rayon retenu sur le rail ; « Tout » par défaut. */
  protected readonly shelf = signal<string>(ALL_SHELVES);
  protected readonly allShelves = ALL_SHELVES;
  protected readonly shelfLabels = SHELF_NAV_LABELS;

  protected readonly resuppliesPending = this.resupplies.pending;
  protected readonly alertFailure = this.alerts.failure;
  protected readonly resupplyFailure = this.resupplies.failure;
  protected readonly unorderedFailure = signal<string | null>(null);
  /** L'article dont le reçu sans commande est ouvert à la saisie. */
  protected readonly unorderedSku = signal<string | null>(null);

  /** La demande en cours de chaque visée, pour la journée qu'elle sert. */
  protected readonly asapDraft = computed(() => this.draftFor('asap'));
  protected readonly tomorrowDraft = computed(() => this.draftFor('tomorrow'));

  protected readonly rows = computed(() =>
    buildStockRows({
      articles: this.articles(),
      stock: this.stock(),
      unordered: this.unordered(),
      // Sans suivi, aucun état : les alertes ouvertes ne teintent ni ne trient.
      alertLevels: this.tracking()
        ? new Map([...this.alerts.bySku()].map(([sku, alert]) => [sku, alert.level]))
        : new Map<string, StockAlertLevel>(),
      asapDraft: this.asapDraft(),
      tomorrowDraft: this.tomorrowDraft(),
    }),
  );
  /**
   * Les rayons de la table, en arbre, tirés des LIGNES : une ligne retirée du
   * catalogue n'a pas de famille et va sous « famille inconnue ».
   */
  protected readonly shelves = computed(() => resupplyShelvesOf(this.rows()));
  protected readonly shelfItems = computed(() =>
    this.rows().map((row) => ({ shelfId: resupplyShelfIdOf(row) })),
  );
  protected readonly visibleRows = computed(() =>
    filterStockRows(this.rows(), this.query(), this.shelf()),
  );

  protected readonly targetCount = computed(() => this.countOf(this.target()));

  /** La demande de la visée affichée, et son nom — le champ suit la relecture (R1g). */
  protected readonly targetDraft = computed(() => this.draftFor(this.target()));
  protected readonly draftName = computed(() => this.targetDraft()?.name ?? null);
  protected readonly nameText = linkedSignal(() => this.draftName() ?? '');
  protected readonly usedNames = this.resupplies.usedNames;

  /**
   * L'heure proposée à la demande « pour demain » (H-D3) : celle déjà posée
   * (par un modèle appliqué), sinon celle que le point demande pour demain.
   * Comparée par sa demande ET sa valeur : une relecture après un « +1 »
   * rend une vue neuve, et le champ ne doit pas perdre l'heure saisie.
   */
  private readonly arrivalSeed = computed(
    () => {
      const draft = this.tomorrowDraft();
      return {
        draftId: draft?.id ?? null,
        hour: draft?.arrivalBy ?? this.resupplies.view()?.suggestedArrivalBy ?? '',
      };
    },
    { equal: (a, b) => a.draftId === b.draftId && a.hour === b.hour },
  );
  /** L'heure d'arrivée saisie (`HH:MM`) ; vide : aucune, l'envoi « pour demain » attend. */
  protected readonly arrivalBy = linkedSignal(() => this.arrivalSeed().hour);
  /** « Pour demain » sans heure ne part pas (400 `resupply.arrival.required`). */
  protected readonly arrivalMissing = computed(
    () => this.target() === 'tomorrow' && this.arrivalBy() === '',
  );
  protected readonly arrivalHint = computed(() =>
    this.arrivalMissing()
      ? "Choisissez l'heure d'arrivée au point : sans elle, le réassort pour demain ne part pas."
      : "L'heure à laquelle le réassort doit être au point.",
  );

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), NOW_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

  /** Nomme la demande de la visée affichée ; vide retire le nom. */
  protected async rename(name: string): Promise<void> {
    await this.resupplies.name(this.target(), name);
  }

  protected chooseTarget(value: string): void {
    if (value === 'asap' || value === 'tomorrow') {
      this.chosenTarget.set(value);
    }
  }

  /**
   * Un clic déclare (Faible, Rupture) ou lève (OK). Une rupture se commande
   * au plus tôt : la visée y passe et le curseur va dans sa case.
   */
  protected async setState(row: StockRow, value: string): Promise<void> {
    if (value === row.state || !this.tracking()) {
      return;
    }
    if (value === 'ok') {
      const alert = this.alerts.bySku().get(row.sku);
      if (alert !== undefined) {
        await this.alerts.lift(alert);
      }
      return;
    }
    if (value !== 'low' && value !== 'out_of_stock') {
      return;
    }
    await this.alerts.declare(row.sku, value);
    if (value === 'out_of_stock') {
      this.chosenTarget.set('asap');
      setTimeout(() => this.focusQuantity(row.sku));
    }
  }

  protected async send(target: ResupplyTarget): Promise<void> {
    if (target === 'asap') {
      const draft = this.asapDraft();
      if (draft !== null) {
        await this.resupplies.send(draft);
      }
      return;
    }
    const draft = this.tomorrowDraft();
    const arrivalBy = this.arrivalBy();
    if (draft !== null && arrivalBy !== '') {
      await this.resupplies.send(draft, arrivalBy);
    }
  }

  protected openUnordered(row: StockRow): void {
    this.unorderedFailure.set(null);
    this.unorderedSku.set(row.sku);
  }

  protected closeUnordered(): void {
    this.unorderedSku.set(null);
  }

  protected unorderedSaved(): void {
    this.closeUnordered();
    this.changed.emit();
  }

  private countOf(target: ResupplyTarget): number {
    const draft = target === 'asap' ? this.asapDraft() : this.tomorrowDraft();
    return draft?.lines.length ?? 0;
  }

  private draftFor(target: ResupplyTarget): SiteResupplyDraftView | null {
    const view = this.resupplies.view();
    if (view === null) {
      return null;
    }
    const day = target === 'asap' ? view.today : view.tomorrow;
    return (
      this.resupplies
        .drafts()
        .find((draft) => draft.target === target && draft.serviceDay === day) ?? null
    );
  }

  private focusQuantity(sku: string): void {
    // Par comparaison d'attribut plutôt qu'un sélecteur échappé : un SKU peut tout contenir.
    const cell = [...this.host.nativeElement.querySelectorAll('[data-resupply-quantity]')].find(
      (element) => element.getAttribute('data-resupply-quantity') === sku,
    );
    cell?.querySelector('input')?.focus();
  }
}
