import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldSearchComponent,
  FoldLoadingStateComponent,
  FoldAsideLayoutComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldTabPanelComponent,
  FoldIconComponent,
} from 'fold-ng';

import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { NotifyService } from '../../notify.service';
import { matchingQueue } from '../handover-queue';
import { HandoverQueueStore } from '../handover-queue.store';
import { QueueTable } from '../queue-table/queue-table';
import { HandoverDetail } from '../handover-detail/handover-detail';
import { SCANNED, ScanDialog, type ScanDialogData } from '../scan-dialog/scan-dialog';
import { AdminOrdersService } from '../../commandes/orders.service';

/** Le seuil de `fold-aside-layout` (`@container (max-width: 1040px)`, lu le 2026-10-12). */
const STACK_AT_PX = 1040;

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
 * ## La file est celle du comptoir, pas de cette vue
 *
 * La file du jour, la journée, l'horloge, le point ouvert et ses compteurs
 * vivent dans `HandoverQueueStore`, fourni par l'espace du comptoir : la bande
 * de tête les affiche sur les trois vues, et ils survivent au changement
 * d'onglet (Hugo, 2026-10-12). Cette vue n'y ajoute que ce qui est à elle — la
 * recherche, la ligne choisie, le scan, le rappel.
 */
@Component({
  selector: 'app-handover-shop-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldIconComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldSearchComponent,
    FoldAsideLayoutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    QueueTable,
    HandoverDetail,
  ],
  templateUrl: './handover-shop-page.html',
  styleUrl: './handover-shop-page.scss',
})
export class HandoverShopPage {
  /** La file du comptoir — partagée avec la bande de tête. */
  protected readonly store = inject(HandoverQueueStore);
  private readonly orders = inject(AdminOrdersService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

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
   * 🔴 fold interroge la largeur de son CONTENEUR. La fenêtre seule ne suffit
   * plus (2026-10-12) : à 1180 px avec le menu, la grille fait ~915 px, fold
   * empile, et le sac restait en colonne SOUS la file au lieu de monter en
   * feuille — la page défilait. On lit donc aussi la largeur de la grille ; la
   * fenêtre reste lue pour le premier rendu, avant toute mesure.
   */
  private readonly narrowWindow = narrowViewport('(max-width: 1040px)');
  private readonly boardRef = viewChild('board', { read: ElementRef<HTMLElement> });
  private readonly boardWidth = signal(0);
  protected readonly stacked = computed(
    () => this.narrowWindow() || (this.boardWidth() > 0 && this.boardWidth() <= STACK_AT_PX),
  );

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

  /**
   * Combien de lignes le terme laisse — ce que la boîte annonce à voix haute.
   *
   * 🔴 Calculé ici par la MÊME fonction que la file, et non demandé à la file :
   * une requête de vue résout l'instance avant que ses entrées soient liées, et
   * Angular levait `NG0950` sur `entries`. Deux appels d'une fonction pure ne
   * peuvent pas diverger ; une barre qui interroge sa table, si.
   */
  protected readonly matches = computed<number | null>(() =>
    this.query() === '' ? null : matchingQueue(this.store.rows(), this.query()).length,
  );

  /** Ce que le rail montre — la ligne choisie, relue dans la file courante. */
  protected readonly selected = computed<HandoverQueueEntryView | null>(() => {
    const id = this.selectedId();
    return id === null
      ? null
      : (this.store.entries().find((entry) => entry.orderId === id) ?? null);
  });

  /**
   * Le sur-titre de la file. Il nomme l'onglet ouvert parce que c'est ce qu'on
   * lit : « la file » seule laisserait croire qu'on voit tout le comptoir alors
   * qu'un onglet en cache la moitié.
   */
  protected readonly eyebrow = computed<string>(() => {
    const active = this.store.activeTab();
    if (active === '') {
      return 'La file';
    }
    const tab = this.store.tabs().find((item) => item.key === active);
    return `La file · ${tab?.label ?? active}`;
  });

  constructor() {
    effect((onCleanup) => {
      const board = this.boardRef()?.nativeElement;
      if (board === undefined || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        this.boardWidth.set(entry?.contentRect.width ?? 0);
      });
      observer.observe(board);
      onCleanup(() => observer.disconnect());
    });

    // 🔴 Changer de jour — à la main ou à minuit — referme le sac et vide la
    // recherche : le sac ouvert appartenait à la journée qu'on quitte, et un
    // terme qui survit laisse une file amputée sous des yeux qui veulent tout
    // voir. Les gestes vivent dans la bande ; la vue suit le fait.
    effect(() => {
      this.store.day();
      untracked(() => {
        this.clearSelection();
        this.query.set('');
      });
    });
    // Même raison pour l'onglet de point : un terme qui survit à ce geste fait
    // lire « Le Village 2 » avec une seule ligne devant soi.
    effect(() => {
      this.store.requestedTab();
      untracked(() => this.query.set(''));
    });
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
      openTab: this.store.activeTab(),
    };
    const ref = this.panels.open<ScanDialogData, string>(ScanDialog, { data });
    void ref.closed.then((result) => {
      if (result === SCANNED) {
        void this.store.load();
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
