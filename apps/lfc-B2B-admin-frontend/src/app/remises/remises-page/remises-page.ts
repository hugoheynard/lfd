import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldAsideLayoutComponent,
  FoldDataTableRowNoteDirective,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldSurfaceDirective,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldBadgeVariant,
  type FoldTabItem,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { HandoverQueueService } from '../handover-queue.service';
import {
  ALL_PICKUPS,
  clockOf,
  entriesForTab,
  formatHour,
  formatWindow,
  isLate,
  lateLabel,
  lateMinutes,
  pickupTabs,
  queueCounters,
  rowTone,
  sortedQueue,
  stateLabel,
  stateVariant,
  type QueueCounters,
} from '../handover-queue';
import { RemiseDetail } from '../remise-detail/remise-detail';
import { SCANNED, ScanPanel, type ScanPanelData } from '../scan-panel/scan-panel';
import { AdminOrdersService } from '../../commandes/orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/** `AAAA-MM-JJ` d'un instant, en heure locale — le jour tel que l'équipe le dit. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Le battement de l'horloge de comptoir. Trente secondes : une ligne bascule
 * « en retard » au plus une demi-minute après l'avoir été, et le navigateur ne
 * repeint que deux fois par minute une page qui reste ouverte toute la matinée.
 */
const TICK_MS = 30_000;

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
 * règle vit dans `isLate`, avec sa raison ; `lateMinutes` ne fait que la
 * chiffrer.
 *
 * ⚠️ **Une commande annulée reste dans la file.** C'est la seule façon que
 * l'équipe puisse dire à quelqu'un qui se présente pourquoi on ne lui donne
 * rien — la masquer transformerait un refus explicable en commande disparue.
 *
 * ## L'horloge tourne, et c'est le sujet
 *
 * 🔴 L'instant du jugement était **figé à la lecture**. Sur un écran qu'on
 * laisse ouvert du premier au dernier client, cela voulait dire qu'aucune ligne
 * ne passait jamais en retard : il fallait recharger pour l'apprendre. Il bat
 * désormais toutes les trente secondes, et reste un signal — donc les tests le
 * posent où ils veulent, sans attendre.
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
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldAsideLayoutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    // 🔴 La directive, et pas seulement l'attribut dans le gabarit : sans elle
    // `foldSurface="chrome"` est du HTML inerte qu'Angular ignore. Le fond
    // sombre serait peint, la polarité jamais basculée, et le titre rendu à
    // 1,18 de contraste — invisible au typecheck comme à l'AOT.
    FoldSurfaceDirective,
    FoldTabPanelComponent,
    FoldTabsComponent,
    RemiseDetail,
  ],
  templateUrl: './remises-page.html',
  styleUrl: './remises-page.scss',
})
export class RemisesPage {
  private readonly api = inject(HandoverQueueService);
  private readonly orders = inject(AdminOrdersService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  /**
   * L'instance des onglets, pour le `fold-tab-panel` qui la réclame.
   *
   * ⚠️ Par requête de vue et non par variable de gabarit : `#tabBar` déclaré
   * dans la bande de tête ne franchirait pas le bloc `@if` qui l'entoure, et le
   * panneau vit dans une autre branche du `@switch`.
   */
  protected readonly tabBar = viewChild(FoldTabsComponent);

  protected readonly state = signal<LoadState>('loading');
  protected readonly day = signal<string>(isoDay(new Date()));
  private readonly entries = signal<readonly HandoverQueueEntryView[]>([]);

  /**
   * L'instant qui sert à juger un retard. Un **signal**, battu par une horloge
   * plutôt que lu au rendu : le lire au rendu ferait dépendre l'affichage du
   * moment où Angular repeint, et rendrait l'écran intestable.
   */
  private readonly now = signal<Date>(new Date());

  /** La commande dont on envoie le rappel — au plus une, et le bouton le dit. */
  private readonly reminding = signal<string | null>(null);

  /**
   * Les rappels déjà partis, dans cette session d'écran.
   *
   * ⚠️ **Local, et assumé comme tel.** Le serveur ne garde pas trace d'un
   * rappel dans la file ; sans ce jeu, le bouton se réarmerait à l'identique et
   * on enverrait trois courriels à la même personne en trois minutes. Rechargé,
   * l'écran oublie — c'est le prix, et il est plus honnête qu'un compteur
   * inventé côté client.
   */
  private readonly reminded = signal<ReadonlySet<string>>(new Set());

  /**
   * La commande ouverte dans le rail, **par identifiant et non par objet**.
   *
   * 🔴 Garder la ligne elle-même la figerait : après une remise, la file est
   * relue et toutes ses lignes sont de nouveaux objets — le rail continuerait
   * d'afficher « attendue » sur un sac parti. L'identifiant, lui, retrouve la
   * ligne à jour, ou `null` si elle a quitté la journée affichée.
   */
  private readonly selectedId = signal<string | null>(null);

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

  /** Ce que le rail montre — la ligne choisie, relue dans la file courante. */
  protected readonly selected = computed<HandoverQueueEntryView | null>(() => {
    const id = this.selectedId();
    return id === null ? null : (this.entries().find((entry) => entry.orderId === id) ?? null);
  });

  /** Les trois nombres de la bande : sur la JOURNÉE, pas sur l'onglet ouvert. */
  protected readonly counters = computed<QueueCounters>(() =>
    queueCounters(this.entries(), this.day(), this.now()),
  );

  /** L'heure, telle qu'on la dit — « 7 h 26 ». */
  protected readonly clock = computed<string>(() => formatHour(clockOf(this.now())));

  /**
   * Le sur-titre de la file. Il nomme l'onglet ouvert parce que c'est ce qu'on
   * lit : « la file » seule laisserait croire qu'on voit tout le comptoir alors
   * qu'un onglet en cache la moitié.
   */
  protected readonly eyebrow = computed<string>(() => {
    const active = this.activeTab();
    if (active === '' || active === ALL_PICKUPS) {
      return 'La file · tous les points';
    }
    const tab = this.tabs().find((item) => item.key === active);
    return `La file · ${tab?.label ?? active}`;
  });

  protected readonly columns: readonly FoldTableColumn<HandoverQueueEntryView>[] = [
    // Le créneau en tête : c'est l'ordre de la file, et donc l'ordre dans
    // lequel on la parcourt des yeux au comptoir.
    { key: 'window', label: 'Créneau', width: '8rem' },
    // La référence n'a plus sa colonne : elle vit sous le nom du client, où on
    // la lit en même temps que lui. Une colonne pour un identifiant qu'on ne
    // trie ni ne compare prenait la place du seul champ qu'on cherche.
    { key: 'customer', label: 'Client' },
    { key: 'units', label: 'Pièces', numeric: true, width: '5.5rem' },
    { key: 'state', label: 'État', width: '8rem' },
    // Assez pour « Scanner » et son icône, pas un pouce de plus : depuis que le
    // rail occupe trente rem, chaque rem repris à une colonne est une colonne
    // que le nom du client ne perd pas.
    { key: 'action', label: '', align: 'right', width: '8.5rem' },
  ];

  protected readonly rowKey = (entry: HandoverQueueEntryView): string => entry.orderId;

  protected readonly toneOf = (entry: HandoverQueueEntryView): FoldTableTone =>
    rowTone(entry, this.day(), this.now());

  constructor() {
    effect(() => {
      void this.load(this.day());
    });

    // L'horloge de comptoir. `window.setInterval` et non `setInterval` : le
    // premier rend un `number`, le second un `Timeout` sous les types Node —
    // et cette app n'a pas de rendu serveur (`ssr: false`), donc rien à garder.
    const tick = window.setInterval(() => this.now.set(new Date()), TICK_MS);
    inject(DestroyRef).onDestroy(() => window.clearInterval(tick));
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

  /** « 56 min de retard », ou `null`. */
  protected lateText(entry: HandoverQueueEntryView): string | null {
    const minutes = lateMinutes(entry, this.day(), this.now());
    return minutes === null ? null : lateLabel(minutes);
  }

  /** « remise 6 h 41 » — l'heure sous le nom, à la place de la référence. */
  protected handedOverAt(entry: HandoverQueueEntryView): string | null {
    if (entry.handedOverAt === null) {
      return null;
    }
    return `remise ${formatHour(clockOf(new Date(entry.handedOverAt)))}`;
  }

  protected label(entry: HandoverQueueEntryView): string {
    return stateLabel(entry.state);
  }

  protected variant(entry: HandoverQueueEntryView): FoldBadgeVariant {
    return stateVariant(entry.state);
  }

  /** Peut-on encore tendre ce sac ? Même règle que le serveur, dite ici pour l'œil. */
  protected remittable(entry: HandoverQueueEntryView): boolean {
    return entry.state !== 'handed_over' && entry.state !== 'cancelled';
  }

  /**
   * Le rappel n'a de sens que sur une commande **déclarée prête**. Le serveur
   * le refuse aussi — la règle vit là-bas, ici on évite d'armer un bouton dont
   * on connaît déjà la réponse.
   */
  protected remindable(entry: HandoverQueueEntryView): boolean {
    return this.remittable(entry) && entry.readyAt !== null && !this.reminded().has(entry.orderId);
  }

  protected reminderSent(entry: HandoverQueueEntryView): boolean {
    return this.reminded().has(entry.orderId);
  }

  protected busy(entry: HandoverQueueEntryView): boolean {
    return this.reminding() === entry.orderId;
  }

  /**
   * **Quelles lignes portent une note.** L'autre moitié du câblage : le gabarit
   * dit à quoi une note ressemble, ceci dit qui en a une.
   *
   * 🔴 Une propriété-flèche et non une méthode : `fold-data-table` la reçoit
   * comme une entrée, donc elle doit garder son `this`. Une méthode passée par
   * référence perdrait le composant et lèverait au premier rendu.
   */
  protected readonly hasNote = (entry: HandoverQueueEntryView): boolean => this.late(entry);

  /**
   * **Ouvre le scanner**, avec ou sans commande attendue.
   *
   * 🔴 Depuis une ligne, il porte la référence : un code qui en désigne une
   * autre est refusé au lieu d'être honoré. Un scan lit ce qu'on lui présente,
   * pas ce qu'on a cliqué — sans ce contrôle, un bouton par ligne remettrait la
   * commande du voisin un matin de coup de feu. Depuis la bande, il vaut
   * `null` : on prend ce qui se présente, comme un comptoir.
   */
  protected scan(entry: HandoverQueueEntryView | null): void {
    const data: ScanPanelData = {
      expected:
        entry === null ? null : { reference: entry.reference, customerLabel: entry.customerLabel },
    };
    const ref = this.panels.open<ScanPanelData, string>(ScanPanel, { data });
    void ref.closed.then((result) => {
      if (result === SCANNED) {
        void this.load();
      }
    });
  }

  /**
   * **Renvoie au client le courriel de retrait.**
   *
   * Le geste du comptoir quand personne n'est venu : le message dit « votre
   * commande vous attend » et reporte le QR. Le serveur REFUSE sur une commande
   * que le fournil n'a pas colisée — un rappel qui ferait venir quelqu'un
   * devant un comptoir vide est pire que pas de rappel.
   */
  protected async remind(entry: HandoverQueueEntryView): Promise<void> {
    this.reminding.set(entry.orderId);
    try {
      await this.orders.remindHandover(entry.orderId);
      this.reminded.update((sent) => new Set([...sent, entry.orderId]));
      this.notify.success(`Rappel envoyé pour ${entry.reference}.`);
    } catch (caught) {
      this.notify.error(caught, "Le rappel n'a pas pu être envoyé.");
    } finally {
      this.reminding.set(null);
    }
  }

  /** Referme le rail. Il reste à l'écran, vide — rien ne disparaît. */
  protected clearSelection(): void {
    this.selectedId.set(null);
  }

  /** Ouvre la ligne dans le rail. Rien ne s'ouvre ni ne se ferme : il est là. */
  protected select(entry: HandoverQueueEntryView): void {
    this.selectedId.set(entry.orderId);
  }
}
