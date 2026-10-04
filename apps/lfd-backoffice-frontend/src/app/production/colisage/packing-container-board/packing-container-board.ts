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
import type { BinTypeView, PackingContainerView, PackingLine, PackingSheet } from '@lfd/contracts';
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
  unallocatedOf,
} from '../container-board';
import { PackingContainerGestures } from '../packing-container-gestures';

/** Au plus tant de sacs par bac — la borne du contrat, recopiée (zod hors du paquet). */
const MAX_INNER_BAGS = 50;

/**
 * Au doigt, le glisser part après un appui tenu : sans ce délai, faire défiler
 * la liste des produits attraperait une ligne. À la souris, tout de suite.
 */
const DRAG_START_DELAY = { touch: 250, mouse: 0 } as const;

/** Une lecture des formats de bac. */
type Loadable<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: T };

/** Un dépôt qui attend sa quantité : la ligne, le contenant, et ce qui reste. */
interface PendingDrop {
  readonly orderId: string;
  readonly containerId: string;
  readonly sku: string;
  readonly productName: string;
  readonly max: number;
}

/**
 * **Les produits et les contenants d'une commande `listed`** (K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §2, §5, §5.1) — les deux premières
 * des trois colonnes ; « À répartir » reste celle du poste.
 *
 * On crée un bac (livraison) ou un sac (retrait), on y **glisse** une ligne,
 * et l'écran demande combien (« tout » par défaut) : une ligne se coupe entre
 * deux contenants. On retire une répartition, on annule un contenant ;
 * « Proposer » pré-remplit sur un clic, jamais d'office.
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
  protected readonly innerBags = signal<number | null>(0);
  protected readonly maxInnerBags = MAX_INNER_BAGS;

  private readonly pendingDrop = signal<PendingDrop | null>(null);
  /** Le dépôt en attente, s'il porte sur la commande ouverte. */
  protected readonly pending = computed(() => {
    const drop = this.pendingDrop();
    return drop !== null && drop.orderId === this.sheet().orderId ? drop : null;
  });
  protected readonly pendingQuantity = signal<number | null>(null);

  protected readonly dragDelay = DRAG_START_DELAY;
  protected readonly title = containerTitle;
  protected readonly pieces = piecesLabel;
  protected readonly unallocated = unallocatedOf;
  protected readonly allocated = allocatedOf;
  protected readonly done = isLineInContainers;

  /** Seules les lignes de produits entrent dans un contenant. */
  protected readonly acceptsProducts = (drag: CdkDrag<unknown>): boolean =>
    typeof drag.data === 'string';
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
        this.pendingDrop.set(null);
      });
    });
  }

  protected draggable(line: PackingLine): boolean {
    return this.editable() && canDragLine(line);
  }

  /** « + Nouveau bac » : déplie les formats, lus une fois. */
  protected toggleChoice(): void {
    this.choosing.update((open) => !open);
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

  protected async addBag(): Promise<void> {
    await this.gestures.open(this.sheet().orderId, { nature: 'bag' });
  }

  protected async propose(): Promise<void> {
    await this.gestures.propose(this.sheet().orderId, this.innerBags() ?? 0);
  }

  /** Une ligne lâchée sur un contenant : on demande combien, « tout » par défaut. */
  protected dropped(event: CdkDragDrop<string, unknown, unknown>): void {
    if (event.previousContainer === event.container || typeof event.item.data !== 'string') {
      return;
    }
    this.askQuantity(event.container.data, event.item.data);
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
    const accepted = await this.gestures.allocate(
      drop.orderId,
      drop.containerId,
      drop.sku,
      quantity,
    );
    if (accepted) {
      this.pendingDrop.set(null);
    }
  }

  protected async withdraw(
    container: PackingContainerView,
    sku: string,
    quantity: number,
  ): Promise<void> {
    await this.gestures.withdraw(this.sheet().orderId, container.id, sku, quantity);
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
}
