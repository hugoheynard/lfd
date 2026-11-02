import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResupplyDraftView,
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
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { ResupplyQuantityCell } from '../resupply-quantity-cell/resupply-quantity-cell';
import {
  ALL_CATEGORIES,
  buildStockRows,
  categoryOptionsOf,
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
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
    ResupplyNameField,
    ResupplyQuantityCell,
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
  /**
   * L'instant qui choisit la visée par défaut. Une entrée plutôt qu'un
   * `new Date()` au rendu, comme `cycle-bar` : le test le fixe.
   */
  readonly now = input(Date.now());
  /** Un reçu sans commande a été écrit : la page relit le stock. */
  readonly changed = output();

  /** En mobile, la case seule, en lecture : la toucher ouvre le dialogue (2026-10-28). */
  protected readonly phone = narrowViewport(PHONE_QUERY);

  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly stateLabel = rowStateLabel;

  /** Les colonnes ; « Actions » seulement pour qui écrit. */
  protected readonly columns = computed<readonly FoldTableColumn<StockRow>[]>(() => [
    { key: 'product', label: 'Produit' },
    { key: 'stock', label: 'Stock du jour', numeric: true },
    { key: 'state', label: 'État' },
    { key: 'quantity', label: this.targetLabel() },
    ...(this.canWrite() ? [{ key: 'actions', label: 'Actions', align: 'right' as const }] : []),
  ]);
  protected readonly skuOf = (row: StockRow): string => row.sku;
  /** La rupture en alerte, le stock faible en avertissement. */
  protected readonly toneOf = (row: StockRow): FoldTableTone =>
    row.state === 'out_of_stock' ? 'alert' : row.state === 'low' ? 'warning' : null;

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
  /** La famille retenue par les puces ; `ALL_CATEGORIES` par défaut. */
  protected readonly category = signal<string>(ALL_CATEGORIES);
  protected readonly categoryOptions = computed(() => categoryOptionsOf(this.articles()));

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
      alertLevels: new Map([...this.alerts.bySku()].map(([sku, alert]) => [sku, alert.level])),
      asapDraft: this.asapDraft(),
      tomorrowDraft: this.tomorrowDraft(),
    }),
  );
  protected readonly visibleRows = computed(() =>
    filterStockRows(this.rows(), this.query(), this.category()),
  );

  protected readonly targetCount = computed(() => this.countOf(this.target()));

  /** La demande de la visée affichée, et son nom — le champ suit la relecture (R1g). */
  protected readonly targetDraft = computed(() => this.draftFor(this.target()));
  protected readonly draftName = computed(() => this.targetDraft()?.name ?? null);
  protected readonly nameText = linkedSignal(() => this.draftName() ?? '');
  protected readonly usedNames = this.resupplies.usedNames;

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
    if (value === row.state) {
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
    const draft = target === 'asap' ? this.asapDraft() : this.tomorrowDraft();
    if (draft !== null) {
      await this.resupplies.send(draft);
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
