import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ReceivedOperationView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { formatInstant, pickupPhrase } from '../../../pim/operations/operation-schedule';
import { CanDirective } from '../../../shared/can/can.directive';
import { CatalogueService } from '../../catalogue/catalogue.service';
import {
  OperationOverridePanel,
  type OperationOverridePanelData,
} from '../operation-override-panel/operation-override-panel';
import { audienceLabel } from '../operation-override';
import { ReceivedOperationsService } from '../received-operations.service';

/** Une ligne « ce qui s'applique », ce qui a été reçu en regard. */
interface EffectLine {
  readonly label: string;
  readonly effective: string;
  /** `null` quand la surcharge n'y change rien. */
  readonly received: string | null;
}

/** Une opération reçue, prête à lire. */
export interface OperationCard {
  readonly key: string;
  readonly name: string;
  readonly dates: string;
  readonly withdrawn: string | null;
  readonly hidden: boolean;
  readonly lines: readonly EffectLine[];
  readonly decided: string | null;
  readonly view: ReceivedOperationView;
}

function articlesPhrase(skus: readonly string[], names: ReadonlyMap<string, string>): string {
  return skus.length === 0 ? 'aucun' : skus.map((sku) => names.get(sku) ?? sku).join(', ');
}

/**
 * Ce que la carte montre d'une opération : ce que le référentiel a dit, et
 * ce qui s'applique une fois la surcharge combinée — lu dans `effective`,
 * jamais recalculé ici (le serveur tient le `min` et l'intersection, D9).
 */
export function operationCardOf(
  view: ReceivedOperationView,
  names: ReadonlyMap<string, string>,
): OperationCard {
  const effective = view.effective;
  const differs = (a: string, b: string): string | null => (a === b ? null : b);
  const effectiveUntil = formatInstant(effective.orderUntil);
  const effectiveAudience = audienceLabel(effective.audience);
  const effectiveArticles = articlesPhrase(effective.skus, names);
  const override = view.override;
  return {
    key: view.key,
    name: view.name.fr,
    dates:
      `Commandes jusqu'au ${formatInstant(view.orderUntil)} · retrait ` +
      pickupPhrase(view.pickupFrom, view.pickupUntil),
    withdrawn: view.withdrawn
      ? view.withdrawnAt === null
        ? 'Retirée par le référentiel'
        : `Retirée par le référentiel le ${formatInstant(view.withdrawnAt)}`
      : null,
    hidden: effective.isHidden,
    lines: [
      {
        label: 'Clôture des commandes',
        effective: effectiveUntil,
        received: differs(effectiveUntil, formatInstant(view.orderUntil)),
      },
      {
        label: 'Clientèle',
        effective: effectiveAudience,
        received: differs(effectiveAudience, audienceLabel(view.audience)),
      },
      {
        label: 'Articles',
        effective: effectiveArticles,
        received: differs(effectiveArticles, articlesPhrase(view.skus, names)),
      },
    ],
    // L'AUTEUR n'est pas nommé : la vue ne porte que `decidedBy`, un
    // identifiant interne, là où la surcharge d'un article porte aussi
    // `decidedByName` (`catalog-admin.ts`, lu le 2026-09-24). Un identifiant
    // brut à l'écran ne dirait rien à qui le lit.
    decided: override === null ? null : `Surcharge décidée le ${formatInstant(override.decidedAt)}`,
    view,
  };
}

/**
 * **Les opérations reçues** — Noël, Pâques, la galette, telles que le
 * référentiel les a envoyées, et ce que la réception en retient (D9).
 *
 * Elles se chargent à part de l'arrivée en attente : une opération se relit
 * et se restreint même quand rien n'attend, et un échec ici ne doit pas
 * cacher la relecture d'une livraison.
 */
@Component({
  selector: 'app-received-operations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './received-operations.html',
  styleUrl: './received-operations.scss',
})
export class ReceivedOperations {
  private readonly api = inject(ReceivedOperationsService);
  private readonly catalogue = inject(CatalogueService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  private readonly operations = signal<readonly ReceivedOperationView[]>([]);
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());
  /** Les noms n'ont pas pu être lus : les articles se montrent par leur référence. */
  protected readonly namesFailed = signal(false);

  protected readonly cards = computed(() =>
    this.operations().map((view) => operationCardOf(view, this.names())),
  );

  constructor() {
    void this.load();
  }

  /**
   * Relit les opérations reçues. La page l'appelle après avoir validé une
   * arrivée : c'est l'acceptation qui les écrit, et la carte, chargée à
   * l'ouverture, disait encore « aucune opération reçue » (vu le 2026-09-24).
   */
  reload(): Promise<void> {
    return this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    const [operations, items] = await Promise.allSettled([this.api.list(), this.catalogue.list()]);
    if (operations.status === 'rejected') {
      this.state.set('error');
      return;
    }
    this.operations.set(operations.value);
    this.namesFailed.set(items.status === 'rejected');
    this.names.set(
      items.status === 'fulfilled'
        ? new Map(items.value.map((item) => [item.sku, item.name]))
        : new Map(),
    );
    this.state.set('ready');
  }

  protected decide(card: OperationCard): void {
    const data: OperationOverridePanelData = { operation: card.view, names: this.names() };
    const ref = this.panels.open<OperationOverridePanelData, boolean>(OperationOverridePanel, {
      data,
    });
    void ref.closed.then(async (saved) => {
      if (saved === true) {
        this.notify.success('Surcharge enregistrée.');
        await this.load();
      }
    });
  }
}
