import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { HandoverQueueEntryView, OrderLineView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldBadgeVariant,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { saveBlob } from '../../shared/download/save-blob';
import { formatWindow, stateLabel, stateVariant } from '../handover-queue';

/** Ce que la file remet au panneau : la ligne cliquée, et rien de plus. */
export interface RemiseDetailData {
  readonly entry: HandoverQueueEntryView;
}

type LoadState = 'loading' | 'ready' | 'error';

const PLACED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * **Ce qu'il y a dans le sac** — le détail d'une ligne de la file.
 *
 * ## Pourquoi il charge la commande alors que la file est déjà là
 *
 * Parce que la file ne porte AUCUNE ligne de marchandise, et c'est le sens de
 * sa séparation d'avec la vue détaillée : charger le détail de quarante
 * commandes pour n'en ouvrir qu'une est exactement le coût que le contrat
 * évite. Le panneau paie donc une lecture, au clic, pour une seule commande.
 *
 * ## Ce qu'il ne fait pas
 *
 * 🔴 **Il n'atteste aucune remise.** Attester passe par le scan
 * (`/retrait/:token`) : le scan prouve la présence, la session prouve
 * l'identité. Un bouton « remise » ici n'aurait ni l'un ni l'autre — il
 * attesterait qu'un membre du staff a cliqué sur une ligne.
 *
 * Un panneau et non un dialogue centré parce que fold n'a pas de dialogue :
 * `fold-panel-host` est sa seule surface d'overlay.
 */
@Component({
  selector: 'app-remise-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './remise-detail-panel.html',
  styleUrl: './remise-detail-panel.scss',
})
export class RemiseDetailPanel implements FoldPanelContent<RemiseDetailData> {
  /** La forme intrinsèque du panneau : une liste d'articles n'a pas besoin d'un A4. */
  static readonly foldPanel: FoldPanelDefaults = { width: 'md' };

  readonly data = input<RemiseDetailData | undefined>();

  private readonly api = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly lines = signal<readonly OrderLineView[]>([]);
  protected readonly busy = signal(false);

  protected readonly entry = computed<HandoverQueueEntryView | null>(
    () => this.data()?.entry ?? null,
  );

  /** Le créneau écrit, ou `null` — aucune heure n'est inventée ici non plus. */
  protected readonly window = computed<string | null>(() => {
    const entry = this.entry();
    return entry === null ? null : formatWindow(entry.window);
  });

  protected readonly stateText = computed<string>(() => {
    const entry = this.entry();
    return entry === null ? '' : stateLabel(entry.state);
  });

  protected readonly stateTone = computed<FoldBadgeVariant>(() => {
    const entry = this.entry();
    return entry === null ? 'neutral' : stateVariant(entry.state);
  });

  protected readonly placedAt = computed<string>(() => {
    const entry = this.entry();
    return entry === null ? '' : PLACED_AT.format(new Date(entry.placedAt));
  });

  constructor() {
    // L'entrée du panneau n'est pas encore liée dans le constructeur : c'est
    // l'hôte qui la pose. L'effet attend donc qu'elle arrive.
    effect(() => {
      const entry = this.entry();
      if (entry !== null) {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    const entry = this.entry();
    if (entry === undefined || entry === null) {
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    try {
      const order = await this.api.byId(entry.orderId);
      this.lines.set(order.lines);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Le bon de commande, tel que le client l'a. Le même document sous la même
   * clé d'archive — c'est ce qui permet d'en discuter au comptoir.
   */
  protected async download(): Promise<void> {
    const entry = this.entry();
    if (entry === null) {
      return;
    }
    this.busy.set(true);
    try {
      const pdf = await this.api.sheetPdf(entry.orderId);
      saveBlob(pdf, `bon-de-commande-${entry.reference}.pdf`);
    } catch (caught) {
      this.notify.error(caught, "Le bon de commande n'a pas pu être téléchargé.");
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.panel.close();
  }
}
