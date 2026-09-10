import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldBadgeVariant,
  type FoldTabItem,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { HandoverQueueService } from '../handover-queue.service';
import {
  entriesForTab,
  formatWindow,
  isLate,
  pickupTabs,
  rowTone,
  sortedQueue,
  stateLabel,
  stateVariant,
} from '../handover-queue';
import {
  RemiseDetailPanel,
  type RemiseDetailData,
} from '../remise-detail-panel/remise-detail-panel';

type LoadState = 'loading' | 'ready' | 'error';

/** `AAAA-MM-JJ` d'un instant, en heure locale — le jour tel que l'équipe le dit. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * **La file de remise** — qui attend au comptoir, ce jour-là.
 *
 * ## Ce que l'écran refuse de faire
 *
 * 🔴 **Il n'invente aucune heure.** Une commande sans créneau demandé — le cas
 * de masse, le backfill du 2026-08-15 en a posé sur tout l'historique — reste à
 * l'écran, en fin de file, et dit « sans créneau ». La faire disparaître
 * laisserait quelqu'un chercher une commande au comptoir pendant qu'elle est
 * là ; lui prêter une heure ferait pire, en la rangeant au mauvais endroit.
 *
 * 🔴 **Il ne parle de retard que sur une tranche demandée.** Un créneau
 * `default` est une heure d'ouverture du point, recopiée à la commande. La
 * règle vit dans `isLate`, avec sa raison.
 *
 * ⚠️ **Une commande annulée reste dans la file.** C'est la seule façon que
 * l'équipe puisse dire à quelqu'un qui se présente pourquoi on ne lui donne
 * rien — la masquer transformerait un refus explicable en commande disparue.
 *
 * ## Un seul appel, des onglets locaux
 *
 * Le serveur rend la journée entière, tous points confondus, et les onglets
 * sont dérivés des `pickupLabel` reçus. Aucun nom de point n'est écrit ici : un
 * comptoir ouvert demain apparaît sans qu'on y touche.
 */
@Component({
  selector: 'app-remises-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
  ],
  templateUrl: './remises-page.html',
  styleUrl: './remises-page.scss',
})
export class RemisesPage {
  private readonly api = inject(HandoverQueueService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly day = signal<string>(isoDay(new Date()));
  private readonly entries = signal<readonly HandoverQueueEntryView[]>([]);

  /**
   * L'instant qui sert à juger un retard, figé à la lecture. Le relire à chaque
   * rendu ferait dépendre l'affichage du moment où Angular repeint — et rendrait
   * l'écran intestable.
   */
  private readonly now = signal<Date>(new Date());

  /** La clé d'onglet demandée par l'utilisateur — pas forcément encore valide. */
  private readonly requestedTab = signal<string>('');

  protected readonly tabs = computed<readonly FoldTabItem[]>(() =>
    pickupTabs(this.entries()).map((tab) => ({
      key: tab.key,
      label: tab.label,
      badge: tab.count,
    })),
  );

  /**
   * L'onglet réellement actif. Il retombe sur le premier dès que la clé
   * demandée n'existe plus — changer de jour change les points de retrait
   * présents, et une clé morte laisserait une file vide sans rien expliquer.
   */
  protected readonly activeTab = computed<string>(() => {
    const tabs = this.tabs();
    const requested = this.requestedTab();
    if (tabs.some((tab) => tab.key === requested)) {
      return requested;
    }
    return tabs[0]?.key ?? '';
  });

  /** La file de l'onglet, ordonnée par créneau puis par heure de commande. */
  protected readonly rows = computed<readonly HandoverQueueEntryView[]>(() =>
    sortedQueue(entriesForTab(this.entries(), this.activeTab())),
  );

  protected readonly total = computed(() => this.entries().length);

  protected readonly columns: readonly FoldTableColumn<HandoverQueueEntryView>[] = [
    // Le créneau en tête : c'est l'ordre de la file, et donc l'ordre dans
    // lequel on la parcourt des yeux au comptoir.
    { key: 'window', label: 'Créneau', width: '11rem' },
    { key: 'customer', label: 'Client' },
    { key: 'reference', label: 'Référence' },
    { key: 'units', label: 'Pièces', numeric: true },
    { key: 'state', label: 'État' },
  ];

  protected readonly rowKey = (entry: HandoverQueueEntryView): string => entry.orderId;

  protected readonly toneOf = (entry: HandoverQueueEntryView): FoldTableTone =>
    rowTone(entry, this.day(), this.now());

  constructor() {
    effect(() => {
      void this.load(this.day());
    });
  }

  protected async load(day: string = this.day()): Promise<void> {
    this.state.set('loading');
    try {
      const view = await this.api.forDay(day);
      this.entries.set(view.entries);
      this.now.set(new Date());
      this.state.set('ready');
    } catch {
      this.entries.set([]);
      this.state.set('error');
    }
  }

  protected onDay(value: string): void {
    if (value !== '') {
      this.day.set(value);
    }
  }

  protected onTab(key: string): void {
    this.requestedTab.set(key);
  }

  // Le contexte d'un `foldCell` n'est pas typé (`let-row` est `any`) : on entre
  // par des méthodes, qui rendent la ligne typée au passage.
  protected windowLabel(entry: HandoverQueueEntryView): string | null {
    return formatWindow(entry.window);
  }

  protected late(entry: HandoverQueueEntryView): boolean {
    return isLate(entry, this.day(), this.now());
  }

  protected label(entry: HandoverQueueEntryView): string {
    return stateLabel(entry.state);
  }

  protected variant(entry: HandoverQueueEntryView): FoldBadgeVariant {
    return stateVariant(entry.state);
  }

  /** Ce qu'il y a dans le sac, et le bon — dans un panneau, la file en place. */
  protected openDetail(entry: HandoverQueueEntryView): void {
    const data: RemiseDetailData = { entry };
    this.panels.open<RemiseDetailData>(RemiseDetailPanel, { data });
  }
}
