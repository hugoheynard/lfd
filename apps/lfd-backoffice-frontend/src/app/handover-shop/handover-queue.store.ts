import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
  type Signal,
} from '@angular/core';
import { addDays, type HandoverQueueEntryView } from '@lfd/contracts';
import type { FoldTabItem, FoldTabsContext } from 'fold-ng';

import { DayVersionWatcher } from '../shared/day-version/day-version-watcher';
import { PickupAddressesService } from '../b2b/reglages/pickup-addresses.service';
import { HandoverQueueService } from './handover-queue.service';
import {
  atTheCounter,
  clockOf,
  entriesForTab,
  formatHour,
  pickupTabs,
  queueCounters,
  type QueueCounters,
} from './handover-queue';

export type HandoverQueueLoadState = 'loading' | 'ready' | 'error';

/**
 * « samedi 16 août » — la journée regardée, en toutes lettres.
 *
 * Déclaré ICI et non repris de `production/worksheet-day.ts`, qui porte le même
 * format : ce sont deux blocs, et le comptoir n'a pas à dépendre du fournil pour
 * écrire une date. Trois lignes dupliquées coûtent moins qu'un import qui
 * traverse une frontière.
 */
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

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
 * **La file de retrait du jour, partagée par le comptoir** — ce que la bande de
 * tête affiche et ce que la vue Retrait détaille.
 *
 * Fourni par `ComptoirWorkspacePage` (`providers`), et NON en racine : la file
 * et le point choisi survivent au passage d'un onglet du comptoir à l'autre
 * (Hugo, 2026-10-12 : « le masthead devrait rester présent sur toutes les
 * pages »), et meurent avec l'espace. Instancié au premier `inject` seulement —
 * donc jamais pour un poste sans `handover_counter:read`, à qui l'espace ne
 * monte pas la bande : pas d'appel, pas de 403.
 *
 * ## Ce que la file refuse de faire
 *
 * 🔴 **Elle n'invente aucune heure.** Une commande sans créneau demandé reste
 * à l'écran, en fin de file, et dit « sans créneau ».
 *
 * ⚠️ **Une commande annulée reste dans la file** : c'est la seule façon que
 * l'équipe puisse dire à quelqu'un qui se présente pourquoi on ne lui donne
 * rien.
 *
 * ## L'horloge tourne, et c'est le sujet
 *
 * 🔴 L'instant du jugement était **figé à la lecture** : aucune ligne ne
 * passait jamais en retard sur un écran laissé ouvert. Il bat désormais toutes
 * les trente secondes, et reste un signal — donc les tests le posent où ils
 * veulent, sans attendre.
 *
 * ## Un seul appel, des onglets locaux
 *
 * Le serveur rend la journée entière, tous points confondus, et les onglets
 * sont dérivés des `pickupLabel` reçus. Aucun nom de point n'est écrit ici : un
 * comptoir ouvert demain apparaît sans qu'on y touche.
 */
@Injectable()
export class HandoverQueueStore {
  private readonly api = inject(HandoverQueueService);
  private readonly pickupAddresses = inject(PickupAddressesService);

  /** Les noms de TOUS les points de retrait, pour qu'un point sans commande ait son onglet. */
  private readonly places = signal<readonly string[]>([]);

  readonly state = signal<HandoverQueueLoadState>('loading');

  /**
   * La dernière relecture de fond a échoué : la file affichée est celle d'avant,
   * et l'écran le DIT au lieu de la présenter comme à jour.
   */
  readonly refreshFailed = signal(false);

  /**
   * Le jour de service affiché.
   *
   * Un sélecteur de date a vécu dans la bande jusqu'au **2026-09-11**, retiré
   * parce qu'il mettait à portée du doigt « le seul geste qui peut faire tendre
   * un sac en croyant être un autre jour ». 🔴 **La navigation revient le
   * 2026-09-17** (Hugo), avec son garde-fou : deux flèches, un jour à la fois,
   * et la bande **crie** dès qu'on n'est pas sur aujourd'hui ({@link isToday}).
   */
  private readonly dayState = signal<string>(isoDay(new Date()));
  readonly day = this.dayState.asReadonly();

  /**
   * Suit-on l'horloge, ou consulte-t-on une autre journée ?
   *
   * 🔴 **C'est ce drapeau qui empêche la bascule de minuit d'annuler un geste.**
   * Sans lui, quelqu'un qui ouvre la veille pour une contestation se ferait
   * ramener à aujourd'hui en une demi-minute, sans comprendre pourquoi.
   */
  private readonly followingClock = signal<boolean>(true);

  /**
   * L'instant qui sert à juger un retard. Un **signal**, battu par une horloge
   * plutôt que lu au rendu : le lire au rendu ferait dépendre l'affichage du
   * moment où Angular repeint, et rendrait l'écran intestable.
   */
  private readonly nowState = signal<Date>(new Date());
  readonly now = this.nowState.asReadonly();

  private readonly entriesState = signal<readonly HandoverQueueEntryView[]>([]);
  readonly entries = this.entriesState.asReadonly();

  /** La clé d'onglet demandée par l'utilisateur — pas forcément encore valide. */
  private readonly requested = signal<string>('');
  readonly requestedTab = this.requested.asReadonly();

  /** Sommes-nous sur la journée en cours ? La bande en dépend entièrement. */
  readonly isToday = computed(() => this.day() === isoDay(this.now()));

  /** « samedi 16 août » — la journée regardée, écrite en toutes lettres. */
  readonly dayLabel = computed(() => DAY_LABEL.format(new Date(`${this.day()}T00:00:00`)));

  readonly tabs = computed<readonly FoldTabItem[]>(() =>
    pickupTabs(this.entries(), this.places()).map((tab) => ({
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
  readonly activeTab = computed<string>(() => {
    const tabs = this.tabs();
    const requested = this.requested();
    if (tabs.some((tab) => tab.key === requested)) {
      return requested;
    }
    return tabs[0]?.key ?? '';
  });

  /**
   * Les lignes de l'onglet ouvert. **Pas ordonnées ici** : l'ordre de la file
   * appartient à la file, et `app-queue-table` le pose.
   */
  readonly rows = computed<readonly HandoverQueueEntryView[]>(() =>
    entriesForTab(this.entries(), this.activeTab()),
  );

  readonly total = computed(() => this.entries().length);

  /**
   * Les nombres de la bande : sur le POINT OUVERT, pas sur la journée.
   *
   * 🔴 Ils portaient sur la journée entière jusqu'au 2026-09-11. Qui lit cet
   * écran est DANS un point, et « 3 en retard » dont deux au Village le fait
   * chercher deux sacs qui ne sont pas chez lui.
   *
   * ⚠️ Depuis `rows()` et non depuis la file peinte : `rows` suit l'onglet,
   * jamais la RECHERCHE de la vue Retrait. Un comptoir qui cherche un nom ne
   * doit pas voir son nombre de retards tomber à zéro sous ses yeux.
   */
  readonly counters = computed<QueueCounters>(() =>
    queueCounters(this.rows(), this.day(), this.now()),
  );

  /** L'heure, telle qu'on la dit — « 7 h 26 ». */
  readonly clock = computed<string>(() => formatHour(clockOf(this.now())));

  /**
   * La barre d'onglets, telle que la bande la rend — pour le `fold-tab-panel`
   * de la vue Retrait, qui la réclame (`aria-labelledby`).
   *
   * ⚠️ La bande et le panneau vivent dans deux composants : une variable de
   * gabarit ne franchit pas cette frontière, la bande publie donc sa requête de
   * vue ici ({@link attachTabBar}).
   */
  private readonly tabBarSource = signal<Signal<FoldTabsContext | undefined> | null>(null);
  readonly tabBar = computed<FoldTabsContext | null>(() => this.tabBarSource()?.() ?? null);

  constructor() {
    // Un échec laisse les onglets dérivés de la file, comme avant.
    this.pickupAddresses
      .list()
      .then((list) => this.places.set(list.map((place) => place.label)))
      .catch(() => undefined);
    effect(() => {
      void this.load(this.day());
    });

    // L'horloge de comptoir. `window.setInterval` et non `setInterval` : le
    // premier rend un `number`, le second un `Timeout` sous les types Node —
    // et cette app n'a pas de rendu serveur (`ssr: false`), donc rien à garder.
    //
    // 🔴 Elle fait AUSSI basculer la journée. Sans cela, un poste laissé ouvert
    // la nuit garderait la file de la veille pour toujours, et l'écran
    // montrerait au petit matin une file vide et des retards de douze heures.
    const tick = window.setInterval(() => {
      const instant = new Date();
      this.nowState.set(instant);
      const today = isoDay(instant);
      // ⚠️ **Seulement si l'on suit l'horloge.** Sinon cette ligne annulerait,
      // au plus tard trente secondes après, le geste de quelqu'un venu relire
      // la veille.
      if (this.followingClock() && today !== this.day()) {
        this.dayState.set(today);
      }
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => window.clearInterval(tick));
    // 🔴 La file se relit quand l'une des deux journées bouge (D6,
    // `plan-version-par-journee.md`) : une commande passée au téléphone
    // (commerce) ou un sac fermé au fournil (production). Filet de 5 min inclus.
    inject(DayVersionWatcher).watch({
      journals: ['orders', 'production'],
      date: this.day,
      reload: () => this.refresh(),
    });
  }

  /** Branche la barre d'onglets que la bande rend (cf. {@link tabBar}). */
  attachTabBar(bar: Signal<FoldTabsContext | undefined>): void {
    this.tabBarSource.set(bar);
  }

  async load(day: string = this.day()): Promise<void> {
    this.state.set('loading');
    try {
      const view = await this.api.forDay(day);
      // 🔴 La coupe est faite UNE fois, à la lecture : les onglets, les
      // compteurs, la file et la sélection en dérivent tous.
      this.entriesState.set(atTheCounter(view.entries));
      this.nowState.set(new Date());
      this.refreshFailed.set(false);
      this.state.set('ready');
    } catch {
      this.entriesState.set([]);
      this.state.set('error');
    }
  }

  /**
   * **Relecture de fond**, sans repasser par « Lecture de la file… » : l'écran
   * reste sous les doigts. Un échec garde la file et le dit ; une réponse d'un
   * jour qu'on a quitté entre-temps est jetée.
   */
  async refresh(): Promise<void> {
    const day = this.day();
    if (this.state() !== 'ready') {
      return this.load(day);
    }
    try {
      const view = await this.api.forDay(day);
      if (day === this.day()) {
        this.entriesState.set(atTheCounter(view.entries));
        this.refreshFailed.set(false);
      }
    } catch {
      this.refreshFailed.set(true);
    }
  }

  /** Ouvre l'onglet d'un point de retrait. */
  selectTab(key: string): void {
    this.requested.set(key);
  }

  /**
   * **Change de journée**, d'un jour à la fois. Deux flèches et non un
   * calendrier : au comptoir, le besoin est « la veille » ou « demain ».
   */
  shiftDay(days: number): void {
    const target = addDays(this.day(), days);
    // On ne « suit l'horloge » que si le geste ramène exactement sur le jour
    // courant : revenir à aujourd'hui par la flèche doit rendre à l'écran son
    // comportement de comptoir, bascule de minuit comprise.
    this.followingClock.set(target === isoDay(this.now()));
    this.dayState.set(target);
  }

  /** Revient au jour de service, et **rend la main à l'horloge**. */
  backToToday(): void {
    this.followingClock.set(true);
    this.dayState.set(isoDay(this.now()));
  }
}
