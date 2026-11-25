import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import type {
  PrintOptionRun,
  ProductionDossierPart,
  ProductionPrintOptionsView,
  ProvisionalPrintOrders,
  ProvisionalPrintPayload,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldChoiceRowComponent,
  FoldEmptyStateComponent,
  FoldFieldsetComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldChoiceOption,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { DossierPrintService, type FrozenDossierSelection } from '../../../dossier-print.service';
import { serverMessageOf } from '../../../server-message';
import { GestureIntents } from '../../../../shared/gesture-intents';

/**
 * Ce que l'écran du dossier passe à la fenêtre. `present` ouvre le PDF dans
 * un nouvel onglet et rend l'URL objet si le navigateur l'a bloqué (`null`
 * sinon) : l'URL appartient à l'écran, qui la révoque au PDF suivant ou à sa
 * destruction — jamais à la fermeture de la fenêtre, qui couperait un onglet
 * encore en train de charger.
 */
export interface DossierPrintDialogData {
  readonly date: string;
  readonly dayLabel: string;
  readonly present: (pdf: Blob) => string | null;
}

/** Comment choisir les commandes. */
export type OrdersMode = 'all' | 'since' | 'chosen';

/** Les parties du dossier, dans l'ordre du papier, et leur nom à l'écran. */
export const DOSSIER_PART_LABELS: readonly {
  readonly part: ProductionDossierPart;
  readonly label: string;
}[] = [
  { part: 'cover', label: 'Couverture' },
  { part: 'recap', label: 'Totaux par rayon' },
  { part: 'calendar', label: 'Calendriers' },
  { part: 'orders', label: 'Fiches de commande' },
  { part: 'deliveryNotes', label: 'BL' },
  { part: 'resupplies', label: 'Fiches de réassort' },
  { part: 'functionSheets', label: 'Fiches de fonction' },
];

const ALL_PARTS: readonly ProductionDossierPart[] = DOSSIER_PART_LABELS.map(({ part }) => part);

/** L'heure d'un tirage, à l'heure de Paris — celle du bandeau imprimé. */
const PRINT_TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** « #3 (10:42) ». */
export function runLabel(print: PrintOptionRun): string {
  return `#${String(print.run)} (${PRINT_TIME.format(new Date(print.printedAt))})`;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **La fenêtre d'impression du dossier du jour** (
 * `documentation/fournil/dossier-prod-du-jour.md`).
 *
 * Avant l'arrêt, elle tire une **impression provisoire** numérotée, des
 * commandes en direct ; après, elle réimprime des parties du dossier figé,
 * sans numéro. Tout est coché à l'ouverture : « Imprimer » sans rien toucher
 * rend le dossier entier (archivé, après l'arrêt).
 *
 * Elle reste ouverte après un tirage et se relit : le nouveau numéro entre
 * dans « depuis #N », et l'alerte « la journée a changé » s'éteint.
 */
@Component({
  selector: 'app-dossier-print-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldChoiceRowComponent,
    FoldEmptyStateComponent,
    FoldFieldsetComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './dossier-print-dialog.html',
  styleUrl: './dossier-print-dialog.scss',
})
export class DossierPrintDialog implements FoldPanelContent<DossierPrintDialogData>, OnInit {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<DossierPrintDialogData>();

  private readonly api = inject(DossierPrintService);
  private readonly panel = inject(FoldPanelRef<void>);
  private readonly intents = new GestureIntents();

  protected readonly partLabels = DOSSIER_PART_LABELS;
  protected readonly runLabel = runLabel;

  protected readonly state = signal<LoadState>('loading');
  protected readonly options = signal<ProductionPrintOptionsView | null>(null);

  protected readonly parts = signal<ReadonlySet<ProductionDossierPart>>(new Set(ALL_PARTS));
  protected readonly allGroups = signal(true);
  protected readonly groups = signal<ReadonlySet<string>>(new Set());
  protected readonly ordersMode = signal<OrdersMode>('all');
  protected readonly sinceRun = signal<number | null>(null);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());

  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  /** L'URL du PDF quand le navigateur a bloqué l'onglet : on propose de le télécharger. */
  protected readonly blockedUrl = signal<string | null>(null);

  protected readonly arrested = computed(() => this.options()?.arrested ?? false);
  protected readonly prints = computed(() => this.options()?.prints ?? []);
  protected readonly lastPrint = computed(() => this.prints().at(-1) ?? null);
  /** Les fiches de fonction du jour : sans elles, la partie ne se coche pas. */
  protected readonly functionSheets = computed(() => this.options()?.functionSheets ?? []);
  protected readonly functionSheetsLabel = computed(() => {
    const count = this.functionSheets().length;
    return count === 0
      ? 'Aucune fiche de fonction ce jour'
      : `${String(count)} fiche${count > 1 ? 's' : ''} du jour`;
  });
  /** Les parties que la journée peut imprimer, dans l'ordre du papier. */
  private readonly availableParts = computed(() =>
    this.functionSheets().length > 0
      ? ALL_PARTS
      : ALL_PARTS.filter((part) => part !== 'functionSheets'),
  );
  protected readonly orders = computed(() => this.options()?.orders ?? []);
  protected readonly groupNames = computed(() => this.options()?.groups ?? []);
  protected readonly groupsLegend = computed(() =>
    this.options()?.grouping === 'workstation' ? 'Postes' : 'Rayons',
  );

  /** « Nouvelles ou modifiées » : avant l'arrêt, et s'il y a déjà eu une impression. */
  protected readonly modes = computed<readonly FoldChoiceOption[]>(() => [
    { key: 'all', label: 'Toutes' },
    ...(!this.arrested() && this.prints().length > 0
      ? [{ key: 'since', label: 'Nouvelles ou modifiées' }]
      : []),
    { key: 'chosen', label: 'Choisies' },
  ]);

  protected readonly runOptions = computed(() =>
    this.prints().map((print) => ({ value: print.run, label: runLabel(print) })),
  );

  /** La sélection est-elle imprimable ? Le serveur refuserait une liste vide. */
  protected readonly ready = computed(() => {
    if (this.parts().size === 0) return false;
    if (!this.allGroups() && this.groups().size === 0) return false;
    const mode = this.ordersMode();
    if (mode === 'since') return this.sinceRun() !== null;
    if (mode === 'chosen') return this.chosen().size > 0;
    return true;
  });

  protected readonly fileName = computed(() => `dossier-${this.data().date}.pdf`);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const options = await this.api.printOptions(this.data().date);
      const hadSheets = (this.options()?.functionSheets.length ?? 0) > 0;
      this.options.set(options);
      if (options.functionSheets.length === 0) {
        this.togglePart('functionSheets', false);
      } else if (!hadSheets) {
        this.togglePart('functionSheets', true);
      }
      this.sinceRun.set(options.prints.at(-1)?.run ?? null);
      if (this.ordersMode() === 'since' && (options.arrested || options.prints.length === 0)) {
        this.ordersMode.set('all');
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected togglePart(part: ProductionDossierPart, checked: boolean): void {
    this.parts.update((parts) => toggled(parts, part, checked));
  }

  protected toggleGroup(group: string, checked: boolean): void {
    this.groups.update((groups) => toggled(groups, group, checked));
  }

  protected toggleOrder(orderId: string, checked: boolean): void {
    this.chosen.update((chosen) => toggled(chosen, orderId, checked));
  }

  protected selectMode(key: string): void {
    if (key === 'all' || key === 'since' || key === 'chosen') {
      this.ordersMode.set(key);
    }
  }

  protected async print(): Promise<void> {
    if (this.printing() || !this.ready()) return;
    this.printing.set(true);
    this.error.set(null);
    this.blockedUrl.set(null);
    try {
      if (this.arrested()) {
        await this.printFrozen();
      } else {
        await this.printProvisional();
      }
    } finally {
      this.printing.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }

  /** Un numéro tiré, son PDF ouvert, puis la fenêtre relue (le nouveau #). */
  private async printProvisional(): Promise<void> {
    const date = this.data().date;
    const payload = this.payload();
    const subject = `${date}:${JSON.stringify(payload)}`;
    let id: string;
    try {
      id = await this.api.drawProvisional(date, payload, this.intents.keyFor(subject));
      this.intents.done(subject);
    } catch (caught) {
      this.error.set(serverMessageOf(caught));
      return;
    }
    try {
      this.present(await this.api.provisionalPdf(date, id));
    } catch {
      this.error.set(
        'L’impression est tirée, mais son PDF n’a pas pu être téléchargé. Vérifiez la connexion et réessayez.',
      );
    }
    await this.load();
  }

  private async printFrozen(): Promise<void> {
    try {
      this.present(await this.api.frozenPdf(this.data().date, this.frozenSelection()));
    } catch {
      this.error.set('Le dossier n’a pas pu être téléchargé. Vérifiez la connexion et réessayez.');
    }
  }

  private present(pdf: Blob): void {
    this.blockedUrl.set(this.data().present(pdf));
  }

  private payload(): ProvisionalPrintPayload {
    return {
      parts: this.availableParts().filter((part) => this.parts().has(part)),
      groups: this.allGroups() ? 'all' : this.checkedGroups(),
      orders: this.ordersChoice(),
    };
  }

  private ordersChoice(): ProvisionalPrintOrders {
    const run = this.sinceRun();
    switch (this.ordersMode()) {
      case 'since':
        return run === null ? { kind: 'all' } : { kind: 'since', run };
      case 'chosen':
        return { kind: 'chosen', orderIds: this.checkedOrders() };
      default:
        return { kind: 'all' };
    }
  }

  /** Après l'arrêt : seul ce qui est décoché part en paramètre ; rien → le dossier archivé. */
  private frozenSelection(): FrozenDossierSelection {
    const available = this.availableParts();
    const parts = available.filter((part) => this.parts().has(part));
    return {
      ...(parts.length < available.length ? { parts } : {}),
      ...(this.allGroups() ? {} : { groups: this.checkedGroups() }),
      ...(this.ordersMode() === 'chosen' ? { orders: this.checkedOrders() } : {}),
    };
  }

  /** Dans l'ordre du dossier, pas dans l'ordre des clics. */
  private checkedGroups(): string[] {
    return this.groupNames().filter((group) => this.groups().has(group));
  }

  private checkedOrders(): string[] {
    return this.orders()
      .map((order) => order.orderId)
      .filter((orderId) => this.chosen().has(orderId));
  }
}

function toggled<T>(set: ReadonlySet<T>, value: T, checked: boolean): ReadonlySet<T> {
  const next = new Set(set);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}
