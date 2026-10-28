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
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResupplyDraftView,
  StockAlertLevel,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldNumberInputComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import {
  QuantityDialog,
  type QuantityDialogData,
} from '../../../shared/quantity-dialog/quantity-dialog';
import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { ResupplyReceiptsService } from '../resupply-receipts.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { SiteStockAlertsStore } from '../site-stock-alerts.store';

/** L'état d'une ligne : `ok` n'est pas une alerte, c'est l'absence d'alerte. */
type RowState = 'ok' | StockAlertLevel;

interface StockRow {
  readonly sku: string;
  readonly name: string;
  /** La famille de l'article ; `null` pour un article reçu puis retiré du catalogue. */
  readonly categoryId: string | null;
  readonly stock: number;
  readonly state: RowState;
  readonly asap: number;
  readonly tomorrow: number;
  /** Le reçu sans commande de l'article ; `null` s'il n'y en a pas. */
  readonly unordered: number | null;
}

const STATE_OPTIONS = [
  { value: 'ok', label: 'OK' },
  { value: 'low', label: 'Faible' },
  { value: 'out_of_stock', label: 'Rupture' },
] as const;

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants de famille. */
const ALL_CATEGORIES = '';

/** Les libellés des deux visées, sur le sélecteur et le bouton d'envoi. */
const TARGET_LABELS: Readonly<Record<ResupplyTarget, string>> = {
  asap: 'Au plus tôt',
  tomorrow: 'Pour demain',
};

/**
 * Les pas rapides, de part et d'autre de la case (Hugo, 2026-10-28) : on
 * retire à gauche, on ajoute à droite, du plus fin au plus large en
 * s'éloignant de la case.
 */
const STEPS = [1, 10, 50, 100] as const;

/** Le téléphone — le même seuil que la feuille de style. */
const PHONE_QUERY = '(max-width: 768px)';

/** Le rang de tri : ruptures et stocks faibles, puis les demandés, puis le reste. */
function rankOf(row: StockRow): number {
  if (row.state !== 'ok') {
    return 0;
  }
  return row.asap + row.tomorrow > 0 ? 1 : 2;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * **La table du réassort** (lot R1e, `reassort-boutiques/plan-reapprovisionnement.md`,
 * Hugo 2026-10-21 : « pense comptoir, un clic ») : tous les produits du
 * catalogue publié, leur stock du jour (la somme des reçus réceptionnés),
 * leur état (OK · Faible · Rupture) en un clic, et la demande en cours de
 * chaque visée saisie dans la case. Ruptures et stocks faibles en tête, puis
 * les demandés, puis le reste.
 *
 * Une seule colonne de quantité (lot R1f, Hugo 2026-10-21 : « ça nous
 * encombre visuellement ») : un sélecteur choisit la visée affichée. Par
 * défaut « Pour demain » tant que l'heure limite du réassort n'est pas
 * passée, « Au plus tôt » ensuite ; la demande en cours garde les deux.
 *
 * Elle ne garde rien que le serveur n'ait pas : un état passe par
 * `SiteStockAlertsStore`, une demande par `SiteResuppliesStore` (lot R1c),
 * le reçu sans commande par `ResupplyReceiptsService` — puis la page relit.
 *
 * La demande de la visée affichée se nomme au-dessus d'« Envoyer » (R1g,
 * « Vitrine du matin ») ; les noms déjà employés au point sont proposés.
 */
@Component({
  selector: 'app-resupply-stock-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldNumberInputComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
    ResupplyNameField,
  ],
  templateUrl: './resupply-stock-table.html',
  styleUrl: './resupply-stock-table.scss',
})
export class ResupplyStockTable {
  private readonly alerts = inject(SiteStockAlertsStore);
  private readonly resupplies = inject(SiteResuppliesStore);
  private readonly receipts = inject(ResupplyReceiptsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panels = inject(FoldPanelHostService);

  /** En mobile, la case seule, en lecture : la toucher ouvre le dialogue (2026-10-28). */
  protected readonly phone = signal(false);

  constructor() {
    const query = window.matchMedia(PHONE_QUERY);
    this.phone.set(query.matches);
    const follow = (event: MediaQueryListEvent): void => this.phone.set(event.matches);
    query.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', follow));
  }

  /** En mobile, la case ouvre le dialogue du chiffre et des raccourcis, puis écrit. */
  protected async openQuantity(row: StockRow): Promise<void> {
    if (!this.phone() || this.resuppliesPending()) {
      return;
    }
    const target = this.target();
    const quantity = await this.panels.open<QuantityDialogData, number>(QuantityDialog, {
      data: { label: row.name, quantity: this.quantityOf(target, row) },
    }).closed;
    if (quantity !== undefined) {
      this.setQuantity(target, row, quantity);
      await this.commit(target, row);
    }
  }

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

  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly steps = STEPS;
  /** Les mêmes pas, retirés : le plus large le plus loin de la case. */
  protected readonly downSteps = [...STEPS].reverse();
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

  /** « Tout », puis une puce par famille présente au catalogue, dans son ordre. */
  protected readonly categoryOptions = computed(() => {
    const families = new Map<string, string>();
    for (const article of this.articles()) {
      if (!families.has(article.categoryId)) {
        families.set(article.categoryId, article.categoryName);
      }
    }
    return [
      { value: ALL_CATEGORIES, label: 'Tout' },
      ...[...families].map(([value, label]) => ({ value, label })),
    ];
  });
  protected readonly alertsPending = this.alerts.pending;
  protected readonly resuppliesPending = this.resupplies.pending;
  protected readonly alertFailure = this.alerts.failure;
  protected readonly resupplyFailure = this.resupplies.failure;
  protected readonly unorderedFailure = signal<string | null>(null);
  /** Les saisies en cours, par visée, VERSION de la demande et article. */
  private readonly edits = signal<ReadonlyMap<string, number | null>>(new Map());
  /** L'article dont on saisit le reçu sans commande, et sa quantité. */
  protected readonly unorderedSku = signal<string | null>(null);
  protected readonly unorderedQuantity = signal<number | null>(null);
  protected readonly unorderedPending = signal(false);

  /** La demande en cours de chaque visée, pour la journée qu'elle sert. */
  protected readonly asapDraft = computed(() => this.draftFor('asap'));
  protected readonly tomorrowDraft = computed(() => this.draftFor('tomorrow'));

  protected readonly rows = computed<readonly StockRow[]>(() => {
    const stock = new Map(this.stock().map((line) => [line.sku, line] as const));
    const unordered = new Map(this.unordered().map((line) => [line.sku, line] as const));
    const alerts = this.alerts.bySku();
    const asap = quantities(this.asapDraft());
    const tomorrow = quantities(this.tomorrowDraft());
    const known = new Set(this.articles().map((article) => article.sku));
    // Un article reçu puis retiré du catalogue reste sur la table : il est en vitrine.
    const products = [
      ...this.articles(),
      ...this.stock()
        .filter((line) => !known.has(line.sku))
        .map((line) => ({ sku: line.sku, name: line.label, categoryId: null })),
    ];
    const rows = products.map((product): StockRow => ({
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      stock: stock.get(product.sku)?.estimatedStock ?? 0,
      state: alerts.get(product.sku)?.level ?? 'ok',
      asap: asap.get(product.sku) ?? 0,
      tomorrow: tomorrow.get(product.sku) ?? 0,
      unordered: unordered.get(product.sku)?.receivedQuantity ?? null,
    }));
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rankOf(a.row) - rankOf(b.row) || a.index - b.index)
      .map(({ row }) => row);
  });

  /** Les puces et la recherche se combinent : une ligne passe les deux filtres. */
  protected readonly visibleRows = computed(() => {
    const query = normalize(this.query().trim());
    const category = this.category();
    return this.rows().filter(
      (row) =>
        (category === ALL_CATEGORIES || row.categoryId === category) &&
        (query === '' || normalize(`${row.name} ${row.sku}`).includes(query)),
    );
  });

  protected readonly targetCount = computed(() => this.countOf(this.target()));

  /** La demande de la visée affichée, et son nom (R1g) — le champ suit la relecture. */
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

  /** Un clic déclare (Faible, Rupture) ou lève (OK). Une rupture passe en « Au plus tôt » et y met le curseur. */
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

  protected quantityOf(target: ResupplyTarget, row: StockRow): number | null {
    const edit = this.edits().get(this.editKey(target, row.sku));
    if (edit !== undefined) {
      return edit;
    }
    const quantity = target === 'asap' ? row.asap : row.tomorrow;
    return quantity === 0 ? null : quantity;
  }

  protected setQuantity(target: ResupplyTarget, row: StockRow, quantity: number | null): void {
    this.edits.update((edits) => new Map(edits).set(this.editKey(target, row.sku), quantity));
  }

  /**
   * La case quittée (ou Entrée) écrit la demande : un article absent
   * s'ajoute, présent se corrige, vidé ou à zéro se retire.
   */
  protected async commit(target: ResupplyTarget, row: StockRow): Promise<void> {
    const key = this.editKey(target, row.sku);
    const edit = this.edits().get(key);
    if (edit === undefined) {
      return;
    }
    this.edits.update((edits) => {
      const next = new Map(edits);
      next.delete(key);
      return next;
    });
    const draft = target === 'asap' ? this.asapDraft() : this.tomorrowDraft();
    const current = target === 'asap' ? row.asap : row.tomorrow;
    const wanted = edit ?? 0;
    if (wanted === current) {
      return;
    }
    if (current === 0) {
      await this.resupplies.addLine(target, row.sku, wanted);
    } else if (draft !== null && wanted === 0) {
      await this.resupplies.withdrawLine(draft, row.sku);
    } else if (draft !== null) {
      await this.resupplies.correctLine(draft, row.sku, wanted);
    }
  }

  /** Un pas rapide s'ajoute à la demande : deux ajouts se cumulent, sans version. */
  protected async step(target: ResupplyTarget, row: StockRow, quantity: number): Promise<void> {
    await this.resupplies.addLine(target, row.sku, quantity);
  }

  /**
   * Un pas retiré corrige la demande, sans descendre sous zéro ; à zéro,
   * la ligne se retire. Il part de ce que la case montre, saisie comprise.
   */
  protected async stepDown(target: ResupplyTarget, row: StockRow, quantity: number): Promise<void> {
    const shown = this.quantityOf(target, row) ?? 0;
    if (shown === 0) {
      return;
    }
    this.setQuantity(target, row, Math.max(0, shown - quantity));
    await this.commit(target, row);
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
    this.unorderedQuantity.set(row.unordered);
  }

  protected closeUnordered(): void {
    this.unorderedSku.set(null);
    this.unorderedQuantity.set(null);
  }

  /** Le reçu sans commande de l'article : saisi, corrigé, ou retiré s'il est vidé. */
  protected async saveUnordered(row: StockRow): Promise<void> {
    const quantity = this.unorderedQuantity();
    if (this.unorderedPending()) {
      return;
    }
    this.unorderedPending.set(true);
    this.unorderedFailure.set(null);
    try {
      if (row.unordered === null && quantity !== null) {
        await this.receipts.receive(this.siteId(), this.day(), row.sku, quantity);
      } else if (row.unordered !== null && quantity === null) {
        await this.receipts.withdraw(this.siteId(), this.day(), row.sku);
      } else if (row.unordered !== null && quantity !== null) {
        await this.receipts.correct(this.siteId(), this.day(), row.sku, quantity);
      }
      this.closeUnordered();
      this.changed.emit();
    } catch (error) {
      this.unorderedFailure.set(
        httpErrorMessage(error, "Le reçu sans commande n'a pas pu être enregistré."),
      );
    } finally {
      this.unorderedPending.set(false);
    }
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

  /** Une saisie faite sur une version que l'autre poste a changée tombe d'elle-même. */
  private editKey(target: ResupplyTarget, sku: string): string {
    const draft = target === 'asap' ? this.asapDraft() : this.tomorrowDraft();
    return `${target}:${String(draft?.version ?? 0)}:${sku}`;
  }

  private focusQuantity(sku: string): void {
    // Par comparaison d'attribut plutôt qu'un sélecteur échappé : un SKU peut tout contenir.
    const cell = [...this.host.nativeElement.querySelectorAll('[data-resupply-quantity]')].find(
      (element) => element.getAttribute('data-resupply-quantity') === sku,
    );
    cell?.querySelector('input')?.focus();
  }
}

function quantities(draft: SiteResupplyDraftView | null): ReadonlyMap<string, number> {
  return new Map((draft?.lines ?? []).map((line) => [line.sku, line.quantity] as const));
}
