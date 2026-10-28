import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  BinTypeView,
  DeliveryBinFreeHalfView,
  PackingContainerView,
  PackingLine,
  PackingSheet,
} from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPanelHostService,
  type FoldPanelRef,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { PackingSettingsService } from '../../packing-settings.service';
import { AwaitingBadge } from '../../../shared/awaiting-badge/awaiting-badge';
import { LabelPrinter } from '../../../shared/label-printer/label-printer';
import { type BinFormatButton, binFormatButtons } from '../bin-row';
import {
  allocatedOf,
  canDragLine,
  containerTitle,
  isLineInContainers,
  piecesLabel,
  shareableHalfLabel,
  unallocatedOf,
} from '../container-board';
import { PackingContainerGestures } from '../packing-container-gestures';
import { PackingDayReader } from '../packing-day.reader';
import {
  PackingQuantityDialog,
  type PackingQuantityDialogData,
} from '../packing-quantity-dialog/packing-quantity-dialog';

/** Au plus tant de sacs par bac — la borne du contrat, recopiée (zod hors du paquet). */
const MAX_INNER_BAGS = 50;

/** Le refus d'une proposition vide — il renvoie à l'écran Contenances (plan §7). */
const EMPTY_PROPOSAL_CODE = 'packing.proposal.empty';

/**
 * Au doigt, le glisser part après un appui tenu : sans ce délai, faire défiler
 * la liste des produits attraperait une ligne. À la souris, tout de suite.
 */
const DRAG_START_DELAY = { touch: 250, mouse: 0 } as const;

/** Une lecture (formats de bac, moitiés partageables). */
type Loadable<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: T };

/** Ce qu'on glisse depuis un contenant : la répartition d'une ligne. */
export interface MovingShare {
  readonly containerId: string;
  readonly sku: string;
}

function isMovingShare(data: unknown): data is MovingShare {
  return (
    typeof data === 'object' &&
    data !== null &&
    'containerId' in data &&
    typeof data.containerId === 'string' &&
    'sku' in data &&
    typeof data.sku === 'string'
  );
}

/**
 * **Les produits et les contenants d'une commande `listed`** (K2b,
 * `colisage/colisage.md` §2, §5, §5.1) — les deux premières
 * des trois colonnes ; « À répartir » reste celle du poste.
 *
 * On crée un bac (livraison) ou un sac (retrait), on y **glisse** une ligne,
 * et l'écran demande combien (« tout » par défaut) : une ligne se coupe entre
 * deux contenants. Une répartition se glisse aussi d'un contenant à l'autre
 * : un seul geste serveur, `transfer`. On retire tout ou partie d'une répartition, on annule un
 * contenant ; « Proposer » est appliqué par le serveur sur un clic, jamais
 * d'office, et une livraison peut prendre la moitié libre d'un arrêt voisin
 * (plan §7).
 *
 * 🔴 **Aucun chiffre calculé ici** : `allocated`, `unallocated`, `pieces`
 * sont servis, et chaque geste se relit. Les refus du serveur s'affichent
 * tels quels. « Déclarer prête » reste à la commande ouverte, et sa règle au
 * serveur.
 */
@Component({
  selector: 'app-packing-container-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AwaitingBadge,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    RouterLink,
  ],
  providers: [PackingContainerGestures],
  templateUrl: './packing-container-board.html',
  styleUrl: './packing-container-board.scss',
})
export class PackingContainerBoard {
  protected readonly gestures = inject(PackingContainerGestures);
  private readonly permissions = inject(PermissionsStore);
  private readonly binTypes = inject(DeliveryBinsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly packingSettings = inject(PackingSettingsService);
  private readonly day = inject(PackingDayReader);
  private readonly labels = inject(LabelPrinter);

  /** La commande ouverte, `containerMode = listed`. */
  readonly sheet = input.required<PackingSheet>();

  /**
   * Le reste de la journée par SKU, tel que servi (`remaining` de la
   * marchandise à répartir). Lu sous la quantité demandée sur tablette, où la
   * colonne « Marchandise à répartir » n'a plus la place (2026-10-05, Hugo).
   * Une recherche dans une table, pas un calcul.
   */
  readonly stock = input<ReadonlyMap<string, number>>(new Map());

  private readonly orderId = computed(() => this.sheet().orderId);

  protected readonly canWrite = computed(() => this.permissions.can('production_packing:write'));

  /** Une commande déclarée prête ne bouge plus. */
  protected readonly frozen = computed(() => this.sheet().packedAt !== null);

  protected readonly editable = computed(() => this.canWrite() && !this.frozen());

  protected readonly isDelivery = computed(() => this.sheet().fulfillmentMethod === 'delivery');

  protected readonly containers = computed<readonly PackingContainerView[]>(
    () => this.sheet().containerList ?? [],
  );

  /** Des bacs à étiqueter ? */
  protected readonly hasBins = computed(() => this.containers().some((c) => c.binId !== null));

  /**
   * Les étiquettes des bacs se lisent au PANNEAU du geste (plan des droits par
   * geste §5.3) : le serveur les sert sous l'écriture du colisage OU du
   * chargement. Sans l'une ni l'autre, le bouton ne s'offre pas — il
   * n'ouvrirait qu'un refus.
   */
  protected readonly canPrintBins = computed(
    () =>
      this.permissions.can('production_packing:write') ||
      this.permissions.can('delivery_loading:write'),
  );

  /** Des sacs à étiqueter ? (2026-10-25 : « je ne peux pas faire d'étiquette pour les sacs ».) */
  protected readonly hasBags = computed(() => this.containers().some((c) => c.nature === 'bag'));

  /**
   * Les étiquettes A6 des bacs, en PDF dans un onglet (2026-10-25) : toutes,
   * ou celle d'un bac. N'écrit rien.
   */
  protected printBins(binId: string | null = null): void {
    void this.labels.orderBins(this.sheet().orderId, binId === null ? [] : [binId]);
  }

  /** Les étiquettes des sacs, sur la journée LUE du poste : toutes, ou celle d'un sac. */
  protected printBags(containerId: string | null = null): void {
    void this.labels.bags(
      this.day.date(),
      this.sheet().orderId,
      containerId === null ? [] : [containerId],
    );
  }

  /** Le choix du format est-il déplié (« + Nouveau bac ») ? */
  protected readonly choosing = signal(false);
  protected readonly types = signal<Loadable<readonly BinTypeView[]>>({ status: 'idle' });
  protected readonly buttons = computed<readonly BinFormatButton[]>(() => {
    const types = this.types();
    return types.status === 'ready' ? binFormatButtons(types.value, null) : [];
  });
  /**
   * « Partager une moitié » est-il ouvert dans Réglages › Colisage ? Fermé
   * tant qu'on ne l'a pas lu, et si la lecture échoue : c'est le défaut
   * (Hugo, 2026-10-25), et le serveur refuse de toute façon le geste fermé.
   */
  protected readonly halfSharing = signal(false);
  /** Le choix d'une moitié voisine est-il déplié (« Partager une moitié ») ? */
  protected readonly sharing = signal(false);
  protected readonly halves = signal<Loadable<readonly DeliveryBinFreeHalfView[]>>({
    status: 'idle',
  });
  protected readonly halfLabel = shareableHalfLabel;
  protected readonly innerBags = signal<number | null>(0);
  /** Le lien de sortie d'une proposition vide : la grille des contenances. */
  protected readonly capacitiesLink = '/reglages/livraison/contenances';
  /**
   * La grille des contenances est un écran de la LIVRAISON, gardé par
   * `delivery_settings:read` (`app.routes.ts`, route `contenances`). Sans ce
   * droit, le lien menait à un refus : la proposition vide dit alors à qui
   * s'adresser, sans lien (2026-10-07, relevé avec l'audit des droits).
   */
  protected readonly canSeeCapacities = computed(() =>
    this.permissions.can('delivery_settings:read'),
  );
  protected readonly emptyProposal = computed(
    () => this.gestures.refusal()?.code === EMPTY_PROPOSAL_CODE,
  );
  protected readonly maxInnerBags = MAX_INNER_BAGS;
  private readonly refusalMessage = computed(() => this.gestures.refusal()?.message ?? null);

  /** La question « combien ? » ouverte, s'il y en a une. */
  private dialog: FoldPanelRef | null = null;

  protected readonly dragDelay = DRAG_START_DELAY;
  protected readonly title = containerTitle;
  protected readonly pieces = piecesLabel;
  protected readonly unallocated = unallocatedOf;
  protected readonly allocated = allocatedOf;

  /** « 12 », ou « 1,25 kg » pour un article au poids (`vente-au-poids.md`, P6). */
  protected readonly figure = saleQuantityLabel;
  protected readonly done = isLineInContainers;

  /** Une ligne de produit, ou la répartition d'un autre contenant. */
  protected readonly acceptsProducts = (drag: CdkDrag<unknown>): boolean =>
    typeof drag.data === 'string' || isMovingShare(drag.data);

  /** La colonne des produits ne reçoit rien : on retire par le bouton. */
  protected readonly acceptsNothing = (): boolean => false;

  constructor() {
    // Une autre commande : le refus, la note et le dépôt en attente de la
    // précédente s'oublient. Par l'identifiant, pas par la feuille : chaque
    // relecture sert une feuille neuve, et effacerait le refus qu'elle suit.
    effect(() => {
      this.orderId();
      untracked(() => {
        this.gestures.forget();
        this.choosing.set(false);
        this.sharing.set(false);
        this.halves.set({ status: 'idle' });
        this.closeDialog();
      });
    });
    inject(DestroyRef).onDestroy(() => this.closeDialog());
    void this.loadHalfSharing();
  }

  /** Lu à l'ouverture du tableau ; un poste resté ouvert sur un réglage fermé reçoit le refus du serveur. */
  private async loadHalfSharing(): Promise<void> {
    try {
      this.halfSharing.set((await this.packingSettings.read()).halfSharing);
    } catch {
      this.halfSharing.set(false);
    }
  }

  protected draggable(line: PackingLine): boolean {
    return this.editable() && canDragLine(line);
  }

  /** « + Nouveau bac » : déplie les formats, lus une fois. */
  protected toggleChoice(): void {
    this.choosing.update((open) => !open);
    this.sharing.set(false);
    const types = this.types();
    if (this.choosing() && (types.status === 'idle' || types.status === 'error')) {
      void this.loadTypes();
    }
  }

  protected async addBin(button: BinFormatButton): Promise<void> {
    const innerBags = this.innerBags();
    if (innerBags === null || !Number.isInteger(innerBags) || innerBags < 0) {
      return;
    }
    const opened = await this.gestures.open(this.sheet().orderId, {
      nature: 'bin',
      binTypeId: button.binTypeId,
      half: button.half,
      innerBags,
    });
    if (opened) {
      this.choosing.set(false);
    }
  }

  /** « Partager une moitié » : déplie les moitiés libres voisines, relues à chaque ouverture. */
  protected toggleSharing(): void {
    this.sharing.update((open) => !open);
    this.choosing.set(false);
    if (this.sharing()) {
      void this.loadHalves();
    }
  }

  protected async shareHalf(half: DeliveryBinFreeHalfView): Promise<void> {
    const innerBags = this.innerBags();
    if (innerBags === null || !Number.isInteger(innerBags) || innerBags < 0) {
      return;
    }
    const opened = await this.gestures.open(this.sheet().orderId, {
      nature: 'bin',
      partnerBinId: half.binId,
      innerBags,
    });
    if (opened) {
      this.sharing.set(false);
    }
  }

  protected async addBag(): Promise<void> {
    await this.gestures.open(this.sheet().orderId, { nature: 'bag' });
  }

  protected async propose(): Promise<void> {
    await this.gestures.propose(this.sheet().orderId);
  }

  /** Une ligne lâchée sur un contenant : on demande combien, « tout » par défaut. */
  protected dropped(event: CdkDragDrop<string, unknown, unknown>): void {
    if (event.previousContainer === event.container) {
      return;
    }
    const data = event.item.data;
    if (typeof data === 'string') {
      this.askQuantity(event.container.data, data);
    } else if (isMovingShare(data)) {
      this.askTransfer(data, event.container.data);
    }
  }

  /**
   * Un déplacement, au lâcher : on demande combien, « tout » par défaut —
   * toute la quantité de la ligne dans le contenant de départ.
   */
  askTransfer(share: MovingShare, toContainerId: string): void {
    const from = this.containers().find((candidate) => candidate.id === share.containerId);
    const to = this.containers().find((candidate) => candidate.id === toContainerId);
    const portion = from?.lines.find((candidate) => candidate.sku === share.sku);
    if (portion === undefined || to === undefined || !this.editable() || from === to) {
      return;
    }
    const orderId = this.sheet().orderId;
    this.ask(
      {
        gesture: 'drop',
        title: `Déplacer « ${portion.productName} » vers ${containerTitle(to)}`,
        confirmLabel: 'Déplacer ici',
        max: portion.quantity,
        saleUnit: portion.saleUnit,
        submit: (quantity) =>
          this.gestures.transfer(orderId, share.containerId, share.sku, toContainerId, quantity),
      },
      portion.saleUnit === 'weight',
    );
  }

  /** Le dépôt, sans le glisser : utile au clavier et dans les tests. */
  askQuantity(containerId: string, sku: string): void {
    const line = this.sheet().lines.find((candidate) => candidate.sku === sku);
    const target = this.containers().find((candidate) => candidate.id === containerId);
    if (line === undefined || target === undefined || !this.draggable(line)) {
      return;
    }
    const orderId = this.sheet().orderId;
    this.ask({
      gesture: 'drop',
      title: `Mettre « ${line.productName} » dans ${containerTitle(target)}`,
      confirmLabel: 'Mettre dedans',
      max: unallocatedOf(line),
      saleUnit: line.saleUnit,
      submit: (quantity) => this.gestures.allocate(orderId, containerId, sku, quantity),
    });
  }

  /** « Retirer » : on demande combien, « tout » par défaut. */
  askWithdrawal(container: PackingContainerView, sku: string): void {
    const share = container.lines.find((candidate) => candidate.sku === sku);
    if (share === undefined || !this.editable()) {
      return;
    }
    const orderId = this.sheet().orderId;
    this.ask(
      {
        gesture: 'withdrawal',
        title: `Retirer « ${share.productName} » de ${containerTitle(container)}`,
        confirmLabel: 'Retirer',
        max: share.quantity,
        saleUnit: share.saleUnit,
        submit: (quantity) => this.gestures.withdraw(orderId, container.id, sku, quantity),
      },
      share.saleUnit === 'weight',
    );
  }

  protected async voidContainer(container: PackingContainerView): Promise<void> {
    await this.gestures.void(this.sheet().orderId, container.id);
  }

  /**
   * Ouvre la question « combien ? » ; le geste serveur reste celui du tableau.
   *
   * Un lot au poids qu'on RETIRE ou qu'on DÉPLACE ne se demande pas : il part
   * entier (`vente-au-poids.md`, P6), et le serveur refuserait une part.
   * Au dépôt, on demande encore — la réserve peut ne tenir qu'une partie du
   * poids, et ce manque-là se signale en grammes.
   */
  private ask(
    question: Omit<PackingQuantityDialogData, 'busy' | 'refusal'>,
    wholeLot = false,
  ): void {
    this.closeDialog();
    if (wholeLot) {
      void question.submit(question.max);
      return;
    }
    const data: PackingQuantityDialogData = {
      ...question,
      busy: this.gestures.busy,
      refusal: this.refusalMessage,
    };
    const ref = this.panels.open<PackingQuantityDialogData>(PackingQuantityDialog, { data });
    this.dialog = ref;
    void ref.closed.then(() => {
      if (this.dialog === ref) {
        this.dialog = null;
      }
    });
  }

  private closeDialog(): void {
    this.dialog?.close();
    this.dialog = null;
  }

  private async loadTypes(): Promise<void> {
    this.types.set({ status: 'loading' });
    try {
      this.types.set({ status: 'ready', value: (await this.binTypes.binTypes()).types });
    } catch {
      this.types.set({ status: 'error' });
    }
  }

  private async loadHalves(): Promise<void> {
    this.halves.set({ status: 'loading' });
    try {
      const view = await this.gestures.shareableHalves(this.sheet().orderId);
      this.halves.set({ status: 'ready', value: view.halves });
    } catch {
      this.halves.set({ status: 'error' });
    }
  }
}
