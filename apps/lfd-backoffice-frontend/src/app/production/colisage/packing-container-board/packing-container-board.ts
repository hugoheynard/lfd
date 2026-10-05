import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { AwaitingBadge } from '../awaiting-badge/awaiting-badge';
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

/** Ce qu'on retire en partie : la répartition, et ce qu'elle porte. */
interface PendingWithdrawal {
  readonly orderId: string;
  readonly containerId: string;
  readonly sku: string;
  readonly max: number;
}

/**
 * Un dépôt qui attend sa quantité : la ligne, le contenant, et ce qui reste.
 * `fromContainerId` non nul : un DÉPLACEMENT depuis un autre contenant.
 */
interface PendingDrop {
  readonly orderId: string;
  readonly containerId: string;
  readonly fromContainerId: string | null;
  readonly sku: string;
  readonly productName: string;
  readonly max: number;
}

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
 * (ou « Déplacer vers… », au clavier) : un seul geste serveur, `transfer`. On retire tout ou partie d'une répartition, on annule un
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

  /** La commande ouverte, `containerMode = listed`. */
  readonly sheet = input.required<PackingSheet>();

  private readonly orderId = computed(() => this.sheet().orderId);

  protected readonly canWrite = computed(() => this.permissions.can('production_packing:write'));

  /** Une commande déclarée prête ne bouge plus. */
  protected readonly frozen = computed(() => this.sheet().packedAt !== null);

  protected readonly editable = computed(() => this.canWrite() && !this.frozen());

  protected readonly isDelivery = computed(() => this.sheet().fulfillmentMethod === 'delivery');

  protected readonly containers = computed<readonly PackingContainerView[]>(
    () => this.sheet().containerList ?? [],
  );

  /** Des bacs à étiqueter ? Un sac n'a pas encore d'étiquette (§2.3). */
  protected readonly hasBins = computed(() => this.containers().some((c) => c.binId !== null));

  /** La page d'étiquettes de la commande — la même que la rangée « + format ». */
  protected readonly labelsLink = computed(() => ['/livraison/etiquettes', this.sheet().orderId]);

  /** Le choix du format est-il déplié (« + Nouveau bac ») ? */
  protected readonly choosing = signal(false);
  protected readonly types = signal<Loadable<readonly BinTypeView[]>>({ status: 'idle' });
  protected readonly buttons = computed<readonly BinFormatButton[]>(() => {
    const types = this.types();
    return types.status === 'ready' ? binFormatButtons(types.value, null) : [];
  });
  /** Le choix d'une moitié voisine est-il déplié (« Partager une moitié ») ? */
  protected readonly sharing = signal(false);
  protected readonly halves = signal<Loadable<readonly DeliveryBinFreeHalfView[]>>({
    status: 'idle',
  });
  protected readonly halfLabel = shareableHalfLabel;
  protected readonly innerBags = signal<number | null>(0);
  /** Le lien de sortie d'une proposition vide : la grille des contenances. */
  protected readonly capacitiesLink = '/livraison/contenances';
  protected readonly emptyProposal = computed(
    () => this.gestures.refusal()?.code === EMPTY_PROPOSAL_CODE,
  );
  protected readonly maxInnerBags = MAX_INNER_BAGS;

  private readonly pendingDrop = signal<PendingDrop | null>(null);
  /** Le dépôt en attente, s'il porte sur la commande ouverte. */
  protected readonly pending = computed(() => {
    const drop = this.pendingDrop();
    return drop !== null && drop.orderId === this.sheet().orderId ? drop : null;
  });
  protected readonly pendingQuantity = signal<number | null>(null);

  private readonly pendingWithdrawal = signal<PendingWithdrawal | null>(null);
  /** Le retrait en attente, s'il porte sur la commande ouverte. */
  protected readonly withdrawing = computed(() => {
    const pending = this.pendingWithdrawal();
    return pending !== null && pending.orderId === this.sheet().orderId ? pending : null;
  });
  protected readonly withdrawQuantity = signal<number | null>(null);

  protected readonly dragDelay = DRAG_START_DELAY;
  protected readonly title = containerTitle;
  protected readonly pieces = piecesLabel;
  protected readonly unallocated = unallocatedOf;
  protected readonly allocated = allocatedOf;
  protected readonly done = isLineInContainers;

  /** Une ligne de produit, ou la répartition d'un autre contenant. */
  protected readonly acceptsProducts = (drag: CdkDrag<unknown>): boolean =>
    typeof drag.data === 'string' || isMovingShare(drag.data);

  /** La répartition dont on choisit la destination (« Déplacer vers… »), s'il y en a une. */
  protected readonly moving = signal<MovingShare | null>(null);
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
        this.pendingDrop.set(null);
        this.pendingWithdrawal.set(null);
        this.moving.set(null);
      });
    });
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

  /** Les autres contenants de la commande — les destinations d'un déplacement. */
  protected targetsOf(containerId: string): readonly PackingContainerView[] {
    return this.containers().filter((candidate) => candidate.id !== containerId);
  }

  /** « Déplacer vers… » : déplie (ou replie) les destinations de cette répartition. */
  protected toggleMoving(containerId: string, sku: string): void {
    const current = this.moving();
    const same = current?.containerId === containerId && current.sku === sku;
    this.moving.set(same ? null : { containerId, sku });
  }

  protected isMoving(containerId: string, sku: string): boolean {
    const current = this.moving();
    return current?.containerId === containerId && current.sku === sku;
  }

  /**
   * Un déplacement, sans le glisser : on demande combien, « tout » par défaut —
   * toute la quantité de la ligne dans le contenant de départ.
   */
  askTransfer(share: MovingShare, toContainerId: string): void {
    const from = this.containers().find((candidate) => candidate.id === share.containerId);
    const portion = from?.lines.find((candidate) => candidate.sku === share.sku);
    if (portion === undefined || !this.editable() || share.containerId === toContainerId) {
      return;
    }
    this.moving.set(null);
    this.pendingDrop.set({
      orderId: this.sheet().orderId,
      containerId: toContainerId,
      fromContainerId: share.containerId,
      sku: share.sku,
      productName: portion.productName,
      max: portion.quantity,
    });
    this.pendingQuantity.set(portion.quantity);
  }

  /** Le dépôt, sans le glisser : utile au clavier et dans les tests. */
  askQuantity(containerId: string, sku: string): void {
    const line = this.sheet().lines.find((candidate) => candidate.sku === sku);
    if (line === undefined || !this.draggable(line)) {
      return;
    }
    const max = unallocatedOf(line);
    this.pendingDrop.set({
      orderId: this.sheet().orderId,
      containerId,
      fromContainerId: null,
      sku,
      productName: line.productName,
      max,
    });
    this.pendingQuantity.set(max);
  }

  protected cancelDrop(): void {
    this.pendingDrop.set(null);
  }

  protected async confirmDrop(): Promise<void> {
    const drop = this.pending();
    const quantity = this.pendingQuantity();
    if (drop === null || quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
      return;
    }
    const accepted =
      drop.fromContainerId === null
        ? await this.gestures.allocate(drop.orderId, drop.containerId, drop.sku, quantity)
        : await this.gestures.transfer(
            drop.orderId,
            drop.fromContainerId,
            drop.sku,
            drop.containerId,
            quantity,
          );
    if (accepted) {
      this.pendingDrop.set(null);
    }
  }

  /** « Retirer » : on demande combien, « tout » par défaut. */
  askWithdrawal(container: PackingContainerView, sku: string): void {
    const share = container.lines.find((candidate) => candidate.sku === sku);
    if (share === undefined || !this.editable()) {
      return;
    }
    this.pendingWithdrawal.set({
      orderId: this.sheet().orderId,
      containerId: container.id,
      sku,
      max: share.quantity,
    });
    this.withdrawQuantity.set(share.quantity);
  }

  protected cancelWithdrawal(): void {
    this.pendingWithdrawal.set(null);
  }

  protected async confirmWithdrawal(): Promise<void> {
    const pending = this.withdrawing();
    const quantity = this.withdrawQuantity();
    if (pending === null || quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
      return;
    }
    const accepted = await this.gestures.withdraw(
      pending.orderId,
      pending.containerId,
      pending.sku,
      quantity,
    );
    if (accepted) {
      this.pendingWithdrawal.set(null);
    }
  }

  protected async voidContainer(container: PackingContainerView): Promise<void> {
    await this.gestures.void(this.sheet().orderId, container.id);
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
