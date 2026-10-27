import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  FoldButtonComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageSectionComponent,
  type FoldSelectOption,
  FoldPanelHostService,
} from 'fold-ng';

import { RetraitOpener } from '../retrait-opener.service';
import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { NewOrderAction } from '../../nav/new-order-action/new-order-action';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientCompany } from '../../client-company.service';
import { ClientOrderHistory, type OrderDays } from '../client-order-history.service';
import { DeliveryNoteService } from '../delivery-note.service';
import { OrderSheetService } from '../order-sheet.service';
import { downloadBlob } from '../download-blob';
import {
  historyRowOf,
  isLive,
  rowCopyOf,
  trackedOf,
  type HistoryOrder,
  type RowCopy,
} from '../order-rows';
import { HistoryTable } from '../history-table/history-table';
import { NotifyService } from '../../../notify.service';
import { ReportDialog } from '../report-dialog/report-dialog';
import { TrackCard } from '../track-card/track-card';
import { OrderDayFilter } from '../order-day-filter/order-day-filter';
import { OrderSelectionBar } from '../order-selection-bar/order-selection-bar';
import { OrderSummaryPanel } from '../order-summary-panel/order-summary-panel';

/** L'option « Tous les sites » — aucun identifiant de société n'est vide. */
const ALL_SITES = '';

/**
 * `/mes-commandes` — le suivi, puis la mémoire.
 *
 * Deux registres, et l'ordre n'est pas négociable : ce qui est EN ROUTE d'abord,
 * ce qui est passé ensuite. On ouvre cet écran pour savoir où en est la commande
 * du matin ; l'historique est ce qu'on consulte, pas ce qu'on attend.
 *
 * Les suivis vivent dans un PUITS, et le puits a une raison d'être : le
 * défilement horizontal y annonce qu'il y a autre chose à droite. Sans lui, le
 * débordement passait pour un accident de mise en page — c'est le constat du
 * dossier de design, et il vaut aux deux tailles.
 *
 * 🔴 **La matière vient de notre base** (`GET /companies/:id/orders` et
 * `GET /orders/mine`). Elle venait d'un fichier de maquette : deux suivis et six
 * lignes écrits en dur, montrés à côté d'un panier qui, lui, partait vraiment au
 * serveur.
 *
 * ⚠️ Trois choses manquent encore au modèle pour que cet écran dise tout ce
 * qu'il voudrait : les **horodatages d'étape** (seules la passation et la remise
 * sont datées), le **bon de commande PDF** et le **canal de réclamation**. Elles
 * sont écrites dans `09-mes-commandes.md`. Ce qui manque est absent de l'écran,
 * pas remplacé.
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldPageSectionComponent,
    FoldScrollIndicatorComponent,
    FoldWellComponent,
    HistoryTable,
    NewOrderAction,
    OrderDayFilter,
    OrderSelectionBar,
    TrackCard,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);
  private readonly sheets = inject(OrderSheetService);
  private readonly deliveryNotes = inject(DeliveryNoteService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly qr = inject(RetraitOpener);

  private readonly history_ = inject(ClientOrderHistory);
  private readonly auth = inject(AuthFacade);

  /** La liste n'a pas pu être lue : l'état d'erreur, jamais un tableau sans lignes. */
  protected readonly failed = this.history_.failed;

  /** Une session expirée ne se relit pas : on propose de se reconnecter. */
  protected readonly sessionExpired = this.auth.sessionExpired;
  private readonly client = inject(ClientCompany);

  /**
   * La commande à ouvrir, venue du lien du courriel (`/mes-commandes/:orderId`) ;
   * `null` sur la liste seule.
   */
  protected readonly openOrderId: string | null =
    inject(ActivatedRoute).snapshot.paramMap.get('orderId');

  /** Les mots de l'écran, que les modèles de vue ne portent pas. */
  private readonly rowCopy = computed<RowCopy>(() => rowCopyOf(this.t().orders));

  /** Ce qui VIT : ni remis, ni annulé. Le suivi ne montre que celles-là. */
  protected readonly tracked = computed(() =>
    this.history_
      .orders()
      .filter((order) => isLive(order))
      .map((order) => trackedOf(order, this.rowCopy())),
  );

  protected readonly history = computed(() => {
    const org = this.client.name();
    return this.history_.orders().map((order) => historyRowOf(order, org, this.rowCopy()));
  });

  /**
   * La liste porte-t-elle des commandes de sites ? C'est la DONNÉE qui décide,
   * jamais le rôle : un site, ou un principal sans héritage, n'en reçoit
   * aucune — et ne voit ni la colonne « Site » ni son filtre.
   */
  protected readonly withSites = computed(() => this.history_.sites().length > 0);

  /** « Tous les sites », le compte principal lui-même, puis chacun de ses sites. */
  protected readonly siteOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const own = this.client.company();
    return [
      { value: ALL_SITES, label: this.t().orders.filterAllSites },
      ...(own === null ? [] : [{ value: own.id, label: this.client.name() }]),
      ...this.history_.sites().map((site) => ({ value: site.companyId, label: site.name })),
    ];
  });

  /**
   * Une société est ouverte : le filtre de jours, les cases et le
   * récapitulatif paraissent (plan du récapitulatif, R3). Le perso n'en a pas
   * (§6.8) — `GET /orders/mine` n'a ni filtre ni récapitulatif.
   */
  protected readonly inCompany = computed(() => this.client.company() !== null);

  protected readonly days = this.history_.days;

  /** Les cases cochées, par référence — la clé de ligne de la table. */
  protected readonly selected = signal<ReadonlySet<string | number>>(new Set());

  /**
   * Les commandes cochées ET affichées : une ligne qu'un filtre a fait sortir
   * de la liste ne part pas au récapitulatif sans qu'on la voie.
   */
  private readonly selectedIds = computed(() => {
    const keys = this.selected();
    return this.history()
      .filter((order) => keys.has(order.reference))
      .map((order) => order.id);
  });

  protected readonly selectedCount = computed(() => this.selectedIds().length);

  protected readonly chosenSite = computed(() => this.history_.site() ?? ALL_SITES);

  /**
   * Le sur-titre du bandeau : combien de commandes VIVENT en ce moment.
   *
   * Il double le compte du puits, et c'est voulu : celui-ci se lit AVANT
   * d'avoir descendu, sur le registre sombre — c'est la raison pour laquelle on
   * a ouvert l'écran, et elle ne doit pas attendre le premier défilement.
   */
  protected readonly liveCount = computed(() =>
    this.t().orders.liveCount.replace('{n}', String(this.tracked().length)),
  );

  protected readonly wellHint = computed(() =>
    this.t().orders.wellHint.replace('{n}', String(this.tracked().length)),
  );

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.orders));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.barOnDesktop.set(true);
  }

  /** Le filtre est RELU au serveur (`?site=`) : le mur est dans sa requête. */
  protected chooseSite(site: string): void {
    this.history_.chooseSite(site === ALL_SITES ? null : site);
  }

  /** Les bornes sont RELUES au serveur (`?from=&to=`), combinées au site. */
  protected chooseDays(days: OrderDays): void {
    this.history_.chooseDays(days);
  }

  /** Le récapitulatif de ce qui est coché, avec la période affichée — calculé au serveur. */
  protected summarize(): void {
    const company = this.client.company();
    if (company === null || this.selectedIds().length === 0) {
      return;
    }
    OrderSummaryPanel.open(this.panels, {
      companyId: company.id,
      orderIds: this.selectedIds(),
      period: this.history_.days(),
    });
  }

  /** Une commande vient d'être annulée : la liste se relit, le suivi la quitte. */
  protected renewSession(): void {
    this.auth.renewSession();
  }

  protected reload(): void {
    this.history_.reload();
  }

  /** Ouvre le signalement de cette commande — un dialogue fold, qui envoie pour de bon. */
  protected report(order: HistoryOrder): void {
    ReportDialog.open(this.panels, { orderId: order.id, reference: order.reference });
  }

  /**
   * Le bon de commande, **demandé au serveur** puis proposé au téléchargement.
   *
   * 🔴 Le bouton du tiroir portait l'icône du téléchargement et n'avait aucun
   * `(click)` : il ne faisait rien, sans même le dire. Il rejoint `showQr`
   * ci-dessous dans la même famille de trou — un geste dessiné, jamais branché.
   *
   * Le fichier vient de l'API et non du navigateur, et ce n'est pas un détour :
   * le serveur ARCHIVE ce qu'il a servi la première fois, de sorte qu'un avenant
   * appliqué le lendemain ne réécrit pas le papier que le client a déjà. Un
   * rendu local refabriquerait à partir de ce que la commande dit aujourd'hui.
   */
  protected downloadSheet(order: HistoryOrder): void {
    // Le gabarit appelle une méthode SYNCHRONE : une liaison Angular n'attend
    // pas une promesse, et la lui rendre en laisserait une flotter sans que
    // personne n'attrape son échec.
    void this.fetchSheet(order);
  }

  private async fetchSheet(order: HistoryOrder): Promise<void> {
    try {
      const pdf = await this.sheets.pdfOf(order.id);
      // Le nom se compose sur la RÉFÉRENCE, celle que le client lit sur son
      // écran : c'est ce qu'il cherchera dans son dossier de téléchargements.
      downloadBlob(`confirmation-de-commande-${order.reference}.pdf`, pdf);
    } catch {
      this.notify.error(this.t().orders.purchaseOrderFailed);
    }
  }

  /** Le bon de livraison chiffré d'une commande remise (plan E5a, § 3). */
  protected downloadDeliveryNote(order: HistoryOrder): void {
    void this.fetchDeliveryNote(order);
  }

  private async fetchDeliveryNote(order: HistoryOrder): Promise<void> {
    try {
      downloadBlob(
        `bon-de-livraison-${order.reference}.pdf`,
        await this.deliveryNotes.pdfOf(order.id),
      );
    } catch {
      this.notify.error(this.t().orders.deliveryNoteFailed);
    }
  }

  /**
   * Le QR de retrait de cette commande-là.
   *
   * 🔴 La carte de suivi émettait déjà `qrAsked`, et **rien ne l'écoutait** : le
   * bouton « Voir mon QR » du suivi ne faisait rien du tout, sans même le dire.
   * L'écran existe depuis le lot 4 ; il lui manquait son appelant.
   */
  protected showQr(orderId: string): void {
    this.qr.show(orderId);
  }
}
