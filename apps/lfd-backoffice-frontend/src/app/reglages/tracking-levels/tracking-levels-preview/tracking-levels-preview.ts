import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import type { WorkshopBatch } from '@lfd/contracts';

import { WorksheetLine } from '../../../production/fiche-atelier/worksheet-line/worksheet-line';
import { WorkshopKeypadOpener } from '../../../production/fiche-atelier/workshop-keypad-opener';
import {
  autoReleased,
  DEFAULT_MARGIN,
  DEMO_PRODUCTS,
  DEMO_START,
  DEMO_STATIONS,
  type DemoProduct,
  hhmm,
  isPacked,
  isTrackingLevel,
  stepReleasedAt,
  timeLabel,
  totalOf,
  TRACKING_LEVELS,
  type TrackingLevel,
  workshopLineOf,
} from '../demo-day';

type RowStatus = 'waiting' | 'partial' | 'out' | 'done' | 'pending' | 'problem';

export interface PreviewRow {
  readonly product: DemoProduct;
  readonly total: number;
  readonly produced: number;
  readonly status: RowStatus;
  /** « 120 réputées sorties à 7 h 15 », ou ce que la ligne attend. */
  readonly note: string;
}

/** Une alerte rouge : ce que la cloche reçoit et la Supervision montre. */
export interface DemoAlert {
  readonly id: number;
  readonly productName: string;
  readonly station: string;
  readonly expected: number;
  readonly produced: number;
  readonly reason: string;
  readonly at: string;
  /** Un vert corrigé après coup. */
  readonly correction: boolean;
  /** Des pièces étaient déjà au bac : le manque passe par le colisage. */
  readonly viaPacking: boolean;
  readonly treated: boolean;
}

interface RedDraft {
  readonly sku: string;
  readonly expected: number;
  readonly correction: boolean;
  readonly viaPacking: boolean;
}

const STATUS_BADGE: Readonly<
  Record<
    RowStatus,
    { readonly label: string; readonly variant: 'neutral' | 'success' | 'alert' | 'info' }
  >
> = {
  waiting: { label: 'à venir', variant: 'neutral' },
  partial: { label: 'en partie sorti', variant: 'info' },
  out: { label: 'sorti', variant: 'success' },
  done: { label: 'fait', variant: 'success' },
  pending: { label: 'à confirmer', variant: 'neutral' },
  problem: { label: 'problème', variant: 'alert' },
};

/**
 * **Aperçu des trois niveaux de suivi du fournil**, sur une fausse journée
 * (`documentation/fournil/reflexion-fiche-simple.md`, décisions 1 à 3).
 *
 * Démonstration seulement : aucun appel au serveur, aucun enregistrement,
 * tout l'état vit dans les signaux du composant et disparaît en quittant la
 * page. Le niveau détaillé passe les VRAIS composants de la fiche d'atelier
 * (`WorksheetLine`) sur des fournées factices.
 */
@Component({
  selector: 'app-tracking-levels-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    WorksheetLine,
  ],
  providers: [WorkshopKeypadOpener],
  templateUrl: './tracking-levels-preview.html',
  styleUrl: './tracking-levels-preview.scss',
})
export class TrackingLevelsPreview {
  protected readonly levels = TRACKING_LEVELS;
  protected readonly stations = DEMO_STATIONS;

  readonly level = signal<TrackingLevel>('always-green');
  /** L'horloge de démonstration, en minutes depuis minuit. */
  readonly now = signal(DEMO_START);
  readonly margin = signal<number | null>(DEFAULT_MARGIN);

  /** Niveau simple : les produits déclarés « Fait ». */
  private readonly simpleDone = signal<ReadonlySet<string>>(new Set());
  /** Ce qui est réellement sorti, déclaré par un rouge. */
  private readonly reported = signal<ReadonlyMap<string, number>>(new Map());
  /** Niveau détaillé : les fausses fournées par produit. */
  private readonly batches = signal<ReadonlyMap<string, readonly WorkshopBatch[]>>(new Map());
  private batchSeq = 0;

  readonly red = signal<RedDraft | null>(null);
  readonly redQuantity = signal<number | null>(null);
  readonly redReason = signal('');

  readonly alerts = signal<readonly DemoAlert[]>([]);
  private alertSeq = 0;

  protected readonly clock = computed(() => timeLabel(this.now()));
  private readonly marginMinutes = computed(() => Math.max(0, this.margin() ?? 0));

  readonly rows = computed<readonly PreviewRow[]>(() =>
    DEMO_PRODUCTS.map((product) =>
      this.level() === 'simple' ? this.simpleRow(product) : this.greenRow(product),
    ),
  );

  /** Les alertes non traitées : ce que la Supervision montre en rouge. */
  readonly openAlerts = computed(() => this.alerts().filter((alert) => !alert.treated));

  readonly redProduct = computed(() => {
    const draft = this.red();
    return draft === null ? null : (DEMO_PRODUCTS.find((p) => p.sku === draft.sku) ?? null);
  });

  readonly lines = computed(() =>
    DEMO_PRODUCTS.map((product) => ({
      station: product.station,
      line: workshopLineOf(product, this.batches().get(product.sku) ?? []),
    })),
  );

  protected rowsOf(station: string): readonly PreviewRow[] {
    return this.rows().filter((row) => row.product.station === station);
  }

  protected linesOf(station: string) {
    return this.lines().filter((entry) => entry.station === station);
  }

  protected badge(status: RowStatus) {
    return STATUS_BADGE[status];
  }

  protected chooseLevel(value: string): void {
    if (isTrackingLevel(value)) {
      this.level.set(value);
      this.red.set(null);
    }
  }

  advance(minutes: number): void {
    this.now.update((now) => Math.min(now + minutes, 23 * 60 + 59));
  }

  resetClock(): void {
    this.now.set(DEMO_START);
    this.reported.set(new Map());
    this.simpleDone.set(new Set());
    this.batches.set(new Map());
    this.alerts.set([]);
    this.red.set(null);
  }

  markDone(sku: string): void {
    this.simpleDone.update((done) => new Set([...done, sku]));
  }

  openRed(sku: string): void {
    const product = DEMO_PRODUCTS.find((p) => p.sku === sku);
    if (product === undefined) {
      return;
    }
    const auto = autoReleased(product, this.now(), this.marginMinutes());
    const green = this.level() === 'always-green';
    const correction = green && auto > 0;
    const expected = correction ? auto : totalOf(product);
    this.red.set({
      sku,
      expected,
      correction,
      viaPacking: correction && isPacked(product, this.now()),
    });
    this.redQuantity.set(expected);
    this.redReason.set('');
  }

  cancelRed(): void {
    this.red.set(null);
  }

  confirmRed(): void {
    const draft = this.red();
    const product = this.redProduct();
    if (draft === null || product === null) {
      return;
    }
    const produced = Math.max(0, Math.min(draft.expected, this.redQuantity() ?? 0));
    this.reported.update((map) => new Map([...map, [draft.sku, produced]]));
    this.alertSeq += 1;
    const alert: DemoAlert = {
      id: this.alertSeq,
      productName: product.name,
      station: product.station,
      expected: draft.expected,
      produced,
      reason: this.redReason().trim(),
      at: this.clock(),
      correction: draft.correction,
      viaPacking: draft.viaPacking,
      treated: false,
    };
    this.alerts.update((alerts) => [alert, ...alerts]);
    this.red.set(null);
  }

  markTreated(id: number): void {
    this.alerts.update((alerts) =>
      alerts.map((alert) => (alert.id === id ? { ...alert, treated: true } : alert)),
    );
  }

  recordBatch(sku: string, quantity: number): void {
    this.batchSeq += 1;
    const batch: WorkshopBatch = {
      id: `demo-${String(this.batchSeq)}`,
      quantity,
      recordedAt: `2026-11-18T${hhmm(this.now())}:00`,
      initials: null,
    };
    this.batches.update((map) => new Map([...map, [sku, [...(map.get(sku) ?? []), batch]]]));
  }

  cancelBatch(sku: string, batch: WorkshopBatch): void {
    this.batches.update(
      (map) => new Map([...map, [sku, (map.get(sku) ?? []).filter((b) => b.id !== batch.id)]]),
    );
  }

  protected alertText(alert: DemoAlert): string {
    const missing = alert.expected - alert.produced;
    const said = `${alert.productName} : ${String(alert.produced)} sorties sur ${String(alert.expected)}, il en manque ${String(missing)}`;
    return alert.reason === '' ? said : `${said} — ${alert.reason}`;
  }

  private greenRow(product: DemoProduct): PreviewRow {
    const total = totalOf(product);
    const reported = this.reported().get(product.sku);
    const auto = autoReleased(product, this.now(), this.marginMinutes());
    const next = product.steps.find(
      (step) => this.now() < stepReleasedAt(step, this.marginMinutes()),
    );
    const note =
      next === undefined
        ? 'tout est réputé sorti'
        : `${String(next.quantity)} réputées sorties à ${timeLabel(stepReleasedAt(next, this.marginMinutes()))}`;
    if (reported !== undefined) {
      return { product, total, produced: reported, status: 'problem', note };
    }
    const status: RowStatus = auto >= total ? 'out' : auto > 0 ? 'partial' : 'waiting';
    return { product, total, produced: auto, status, note };
  }

  private simpleRow(product: DemoProduct): PreviewRow {
    const total = totalOf(product);
    const reported = this.reported().get(product.sku);
    if (reported !== undefined) {
      return { product, total, produced: reported, status: 'problem', note: 'problème signalé' };
    }
    if (this.simpleDone().has(product.sku)) {
      return { product, total, produced: total, status: 'done', note: 'tout est sorti' };
    }
    return { product, total, produced: 0, status: 'pending', note: 'à confirmer' };
  }
}
