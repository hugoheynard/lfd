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
import { addDays, type HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldSearchComponent,
  FoldLoadingStateComponent,
  FoldAsideLayoutComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldSurfaceDirective,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { NotifyService } from '../../notify.service';
import { HandoverQueueService } from '../handover-queue.service';
import {
  atTheCounter,
  matchingQueue,
  clockOf,
  entriesForTab,
  formatHour,
  pickupTabs,
  queueCounters,
  type QueueCounters,
} from '../handover-queue';
import { QueueTable } from '../queue-table/queue-table';
import { HandoverDetail } from '../handover-detail/handover-detail';
import { SCANNED, ScanDialog, type ScanDialogData } from '../scan-dialog/scan-dialog';
import { AdminOrdersService } from '../../commandes/orders.service';

type LoadState = 'loading' | 'ready' | 'error';

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
 * **La file de retrait** — qui attend au comptoir, ce jour-là.
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
  selector: 'app-handover-shop-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldElementTitleComponent,
    FoldSearchComponent,
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
    QueueTable,
    HandoverDetail,
  ],
  templateUrl: './handover-shop-page.html',
  styleUrl: './handover-shop-page.scss',
})
export class HandoverShopPage {
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

  /**
   * Le terme cherché. Il vit ICI parce que la barre le porte, et il descend à
   * la file qui, elle, filtre — les compteurs de la journée doivent rester
   * ceux de la journée.
   */
  protected readonly query = signal<string>('');

  /**
   * **La file et le sac ne tiennent plus côte à côte.**
   *
   * 🔴 1040 px est le seuil auquel `fold-aside-layout` laisse tomber sa
   * deuxième colonne — lu dans son CSS compilé le 2026-09-11, et c'est une
   * valeur qu'il tient pour lui. On la redit ici parce qu'il n'en publie pas le
   * jeton, et on la redit UNE fois : la feuille de cet écran ne pose pas de
   * media query, elle suit la classe que ce signal allume. Deux définitions
   * dériveraient, et l'écran basculerait en deux temps.
   *
   * ⚠️ Approximation assumée : fold interroge la largeur de son CONTENEUR,
   * nous celle de la fenêtre. Elles ne diffèrent que si un jour cet écran est
   * posé dans une colonne étroite d'une page large — ce qu'un poste de comptoir
   * ne fait pas.
   */
  protected readonly stacked = narrowViewport('(max-width: 1040px)');

  protected readonly state = signal<LoadState>('loading');
  /**
   * Le jour de service affiché.
   *
   * ## L'histoire de ce champ, parce qu'elle explique sa forme
   *
   * Un sélecteur de date vivait dans la bande jusqu'au **2026-09-11**, puis il a
   * été retiré, avec une raison qui reste vraie : « un comptoir travaille sur le
   * jour qu'il est en train de vivre, et l'offrir en tête d'écran mettait à
   * portée du doigt le seul geste qui peut faire tendre un sac en croyant être
   * un autre jour ». Ce retrait laissait un besoin ouvert, et la page le disait
   * elle-même — relire la file d'hier pour régler une contestation.
   *
   * 🔴 **La navigation revient le 2026-09-17** (Hugo), et le garde-fou avec
   * elle : ce n'est plus un calendrier — deux flèches, un jour à la fois — et
   * l'écran **crie** dès qu'on n'est pas sur aujourd'hui ({@link isToday}). Le
   * risque nommé en septembre n'était pas le déplacement, c'était de ne pas
   * savoir où l'on est ; un sélecteur muet le permettait, une bande qui affiche
   * « VOUS N'ÊTES PAS SUR AUJOURD'HUI » ne le permet plus.
   */
  protected readonly day = signal<string>(isoDay(new Date()));

  /**
   * Suit-on l'horloge, ou consulte-t-on une autre journée ?
   *
   * 🔴 **C'est ce drapeau qui empêche la bascule de minuit d'annuler un geste.**
   * L'horloge de comptoir remet la file sur le jour courant toutes les trente
   * secondes ; sans distinguer les deux situations, quelqu'un qui ouvre la
   * veille pour une contestation se ferait ramener à aujourd'hui en une
   * demi-minute, sans comprendre pourquoi. On ne suit l'horloge que tant que
   * personne n'a demandé autre chose — et {@link backToToday} y ramène.
   */
  private readonly followingClock = signal<boolean>(true);

  /** Sommes-nous sur la journée en cours ? La bande en dépend entièrement. */
  protected readonly isToday = computed(() => this.day() === isoDay(this.now()));

  /** « samedi 16 août » — la journée regardée, écrite en toutes lettres. */
  protected readonly dayLabel = computed(() =>
    DAY_LABEL.format(new Date(`${this.day()}T00:00:00`)),
  );
  private readonly entries = signal<readonly HandoverQueueEntryView[]>([]);

  /**
   * L'instant qui sert à juger un retard. Un **signal**, battu par une horloge
   * plutôt que lu au rendu : le lire au rendu ferait dépendre l'affichage du
   * moment où Angular repeint, et rendrait l'écran intestable.
   */
  protected readonly now = signal<Date>(new Date());

  /** La commande dont on envoie le rappel — au plus une, et le bouton le dit. */
  private readonly reminding = signal<string | null>(null);

  /** Ce que la file a besoin de savoir des rappels : lequel est en vol… */
  protected readonly remindingId = this.reminding.asReadonly();

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

  /** …et lesquels sont déjà partis. */
  protected readonly remindedIds = this.reminded.asReadonly();

  /**
   * La commande ouverte dans le rail, **par identifiant et non par objet**.
   *
   * 🔴 Garder la ligne elle-même la figerait : après un retrait, la file est
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

  /**
   * Les lignes de l'onglet ouvert. **Pas ordonnées ici** : l'ordre de la file
   * appartient à la file, et `app-queue-table` le pose — un appelant qui
   * oublierait de trier obtiendrait une liste juste et illisible.
   */
  protected readonly rows = computed<readonly HandoverQueueEntryView[]>(() =>
    entriesForTab(this.entries(), this.activeTab()),
  );

  protected readonly total = computed(() => this.entries().length);

  /**
   * Combien de lignes le terme laisse — ce que la boîte annonce à voix haute.
   *
   * 🔴 Calculé ici par la MÊME fonction que la file, et non demandé à la file :
   * une requête de vue résout l'instance avant que ses entrées soient liées, et
   * Angular levait `NG0950` sur `entries`. Deux appels d'une fonction pure ne
   * peuvent pas diverger ; une barre qui interroge sa table, si.
   */
  protected readonly matches = computed<number | null>(() =>
    this.query() === '' ? null : matchingQueue(this.rows(), this.query()).length,
  );

  /** Ce que le rail montre — la ligne choisie, relue dans la file courante. */
  protected readonly selected = computed<HandoverQueueEntryView | null>(() => {
    const id = this.selectedId();
    return id === null ? null : (this.entries().find((entry) => entry.orderId === id) ?? null);
  });

  /**
   * Les trois nombres de la bande : sur le POINT OUVERT, pas sur la journée.
   *
   * 🔴 Ils portaient sur la journée entière jusqu'au 2026-09-11, et l'argument
   * — « combien reste-t-il ce matin » — était celui d'un gérant. Personne ne
   * tient ce comptoir-là : qui lit cet écran est DANS un point, et « 3 en
   * retard » dont deux au Village le fait chercher deux sacs qui ne sont pas
   * chez lui. C'est le même raisonnement qui a fait tomber l'onglet « Tous les
   * points » ; laisser les compteurs derrière aurait gardé la vue qu'on venait
   * de retirer.
   *
   * ⚠️ Depuis `rows()` et non depuis la file peinte : `rows` suit l'onglet,
   * jamais la RECHERCHE, qui vit plus bas. Un comptoir qui cherche un nom ne
   * doit pas voir son nombre de retards tomber à zéro sous ses yeux — il
   * lirait que le problème est réglé.
   */
  protected readonly counters = computed<QueueCounters>(() =>
    queueCounters(this.rows(), this.day(), this.now()),
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
    if (active === '') {
      return 'La file';
    }
    const tab = this.tabs().find((item) => item.key === active);
    return `La file · ${tab?.label ?? active}`;
  });

  constructor() {
    effect(() => {
      void this.load(this.day());
    });

    // L'horloge de comptoir. `window.setInterval` et non `setInterval` : le
    // premier rend un `number`, le second un `Timeout` sous les types Node —
    // et cette app n'a pas de rendu serveur (`ssr: false`), donc rien à garder.
    //
    // 🔴 Elle fait AUSSI basculer la journée. Sans cela, un poste laissé ouvert
    // la nuit garderait la file de la veille pour toujours — et depuis que le
    // sélecteur de date a disparu (2026-09-11), plus rien ne permettrait d'en
    // sortir sans recharger la page. L'écran montrerait alors, au petit matin,
    // une file vide et des retards de douze heures.
    const tick = window.setInterval(() => {
      const instant = new Date();
      this.now.set(instant);
      const today = isoDay(instant);
      // ⚠️ **Seulement si l'on suit l'horloge.** Sinon cette ligne annulerait,
      // au plus tard trente secondes après, le geste de quelqu'un venu relire
      // la veille — et l'écran sauterait sous ses doigts sans rien expliquer.
      if (this.followingClock() && today !== this.day()) {
        this.day.set(today);
        this.clearSelection();
      }
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => window.clearInterval(tick));
  }

  protected async load(day: string = this.day()): Promise<void> {
    this.state.set('loading');
    try {
      const view = await this.api.forDay(day);
      // 🔴 La coupe est faite UNE fois, à la lecture : les onglets, les
      // compteurs, la file et la sélection en dérivent tous. Filtrée plus bas,
      // elle aurait manqué l'un d'eux — et c'est le compteur qu'elle aurait
      // manqué, puisqu'il lit `entries` en direct.
      this.entries.set(atTheCounter(view.entries));
      this.now.set(new Date());
      this.state.set('ready');
    } catch {
      this.entries.set([]);
      this.state.set('error');
    }
  }

  /**
   * 🔴 Changer d'onglet ou de jour VIDE la recherche.
   *
   * Un terme qui survit à ce geste laisse une file amputée sous un onglet qu'on
   * vient d'ouvrir pour tout voir : on lit « Le Village 2 » et on n'a qu'une
   * ligne devant soi. C'est exactement ce que `[(value)]` permet — une boîte à
   * sens unique garderait un terme que les résultats n'honorent plus.
   */
  protected onTab(key: string): void {
    this.requestedTab.set(key);
    this.query.set('');
  }

  /**
   * **Ouvre le scanner**, avec ou sans commande attendue.
   *
   * 🔴 Depuis une ligne, il porte la référence : un code qui en désigne une
   * autre est refusé au lieu d'être honoré. Un scan lit ce qu'on lui présente,
   * pas ce qu'on a cliqué — sans ce contrôle, un bouton par ligne remettrait la
   * commande du voisin un matin de coup de feu. Depuis la bande, il vaut
   * `null` : on prend ce qui se présente, comme un comptoir.
   *
   * ⚠️ L'onglet ouvert l'accompagne dans les deux cas. Prendre ce qui se
   * présente ne veut pas dire le prendre en silence : l'écran affirme un point
   * de retrait, et le dialogue doit pouvoir dire quand le code n'en est pas.
   */
  protected scan(entry: HandoverQueueEntryView | null): void {
    const data: ScanDialogData = {
      expected:
        entry === null ? null : { reference: entry.reference, customerLabel: entry.customerLabel },
      // 🔴 L'onglet voyage avec le geste. Depuis la bande, `expected` est
      // `null` — on prend ce qui se présente — mais l'écran, lui, affirme un
      // point de retrait dans son titre et dans ses trois compteurs. Sans cette
      // clé, le scan remettait un sac du Village sans qu'une ligne ne l'ait
      // jamais montré (revue du 2026-09-11, point 3).
      openTab: this.activeTab(),
    };
    const ref = this.panels.open<ScanDialogData, string>(ScanDialog, { data });
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

  /**
   * **Change de journée**, d'un jour à la fois.
   *
   * Deux flèches et non un calendrier : au comptoir, le besoin est « la veille »
   * ou « demain », et un champ de date ouvre la porte à un saut de trois
   * semaines qu'on ne relit pas. La sélection tombe — le sac ouvert appartenait
   * à la journée qu'on quitte — et la recherche aussi, pour la raison écrite
   * dans {@link onTab} : un terme qui survit laisse une file amputée sous un
   * onglet qu'on vient d'ouvrir.
   */
  protected shiftDay(days: number): void {
    const target = addDays(this.day(), days);
    // On ne « suit l'horloge » que si le geste ramène exactement sur le jour
    // courant : revenir à aujourd'hui par la flèche doit rendre à l'écran son
    // comportement de comptoir, bascule de minuit comprise.
    this.followingClock.set(target === isoDay(this.now()));
    this.day.set(target);
    this.clearSelection();
    this.query.set('');
  }

  /** Revient au jour de service, et **rend la main à l'horloge**. */
  protected backToToday(): void {
    this.followingClock.set(true);
    this.day.set(isoDay(this.now()));
    this.clearSelection();
    this.query.set('');
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
