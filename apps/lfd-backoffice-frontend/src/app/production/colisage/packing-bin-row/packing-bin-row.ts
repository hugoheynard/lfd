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
import { RouterLink } from '@angular/router';
import type { BinTypeView, DeliveryBinView, DeliveryPackingProposalView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import {
  type BinFormatButton,
  binFormatButtons,
  declaredBinLabel,
  declaredCountLabel,
  lastLiveBin,
  liveBins,
  oneBinPayload,
  readyWarnings,
} from '../bin-row';

/** Au plus tant de sacs par bac — la borne du contrat, recopiée (zod hors du paquet). */
const MAX_INNER_BAGS = 50;

/** Une lecture de la rangée. */
type Loadable<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: T };

/**
 * **« + Bac M » — le « + » choisit un bac** (`plan-le-plus-choisit-un-bac.md`,
 * D2-D4 ; lot PC1 de `decisions-par-defaut-2026-10-02.md`).
 *
 * Pour une commande LIVRÉE, à la place du compte anonyme de containers : un
 * bouton par type de bac en service (et « ½ » pour un type cloisonnable), qui
 * déclare UN bac tout de suite par la route existante (`POST colisage/bacs`) ;
 * « − » annule le DERNIER bac vivant (`POST …/:binId/annulation`). Le compte
 * affiché EST la liste des bacs déclarés — un seul objet, compté une fois.
 *
 * Le format que la proposition calculée retiendrait est en couleur (Q2) ;
 * rien n'est déclaré d'office. Les formats appartiennent à la livraison (D1) :
 * le fournil n'importe pas la livraison, c'est cet écran qui parle aux deux.
 *
 * Les avertissements de D3 sont exposés par {@link warnings}, que la commande
 * ouverte lit au moment de « Prête » — des avertissements d'écran, jamais un
 * refus.
 *
 * ⚠️ Aucune condition sur le mode d'acheminement ici (D4) : c'est la commande
 * ouverte qui choisit de l'afficher pour une livraison.
 */
@Component({
  selector: 'app-packing-bin-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    RouterLink,
  ],
  templateUrl: './packing-bin-row.html',
  styleUrl: './packing-bin-row.scss',
})
export class PackingBinRow {
  private readonly service = inject(DeliveryLoadingService);
  private readonly binTypes = inject(DeliveryBinsService);
  private readonly permissions = inject(PermissionsStore);

  /** La commande — l'identifiant du commerce, que porte la feuille de colisage. */
  readonly orderId = input.required<string>();

  /** Déclarer un bac : le droit du panneau « Bacs », colisage OU chargement. */
  protected readonly canDeclare = computed(
    () =>
      this.permissions.can('production_packing:write') ||
      this.permissions.can('delivery_loading:write'),
  );

  protected readonly types = signal<Loadable<readonly BinTypeView[]>>({ status: 'loading' });
  protected readonly declared = signal<Loadable<readonly DeliveryBinView[]>>({
    status: 'loading',
  });
  /** La proposition : un confort (couleur, froid). Illisible, elle se tait. */
  private readonly proposal = signal<DeliveryPackingProposalView | null>(null);

  protected readonly innerBags = signal<number | null>(0);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly maxInnerBags = MAX_INNER_BAGS;

  protected readonly buttons = computed<readonly BinFormatButton[]>(() => {
    const types = this.types();
    return types.status === 'ready' ? binFormatButtons(types.value, this.proposal()) : [];
  });

  protected readonly live = computed<readonly DeliveryBinView[]>(() => {
    const declared = this.declared();
    return declared.status === 'ready' ? liveBins(declared.value) : [];
  });

  protected readonly countLabel = computed(() =>
    this.declared().status === 'ready' ? declaredCountLabel(this.live().length) : '',
  );

  /**
   * Les avertissements de D3 — vides tant que les bacs ne sont pas lus : on
   * n'avertit pas de ce qu'on ne sait pas.
   */
  readonly warnings = computed<readonly string[]>(() => {
    const declared = this.declared();
    if (!this.canDeclare() || declared.status !== 'ready') {
      return [];
    }
    return readyWarnings(declared.value, this.proposal());
  });

  protected readonly binLabel = declaredBinLabel;

  constructor() {
    effect(() => {
      const orderId = this.orderId();
      if (untracked(() => this.canDeclare())) {
        untracked(() => this.loadAll(orderId));
      }
    });
  }

  protected labelsLink(): string[] {
    return ['/livraison/etiquettes', this.orderId()];
  }

  /** « + Bac M » : UN bac de ce format, déclaré tout de suite (D2). */
  protected async add(button: BinFormatButton): Promise<void> {
    const innerBags = this.innerBags();
    if (innerBags === null || !Number.isInteger(innerBags) || innerBags < 0) {
      return;
    }
    await this.write(
      () => this.service.declareBins(oneBinPayload(this.orderId(), button, innerBags)),
      'Le bac n’a pas pu être déclaré.',
    );
  }

  /** « − » : annule le dernier bac vivant. Un bac chargé, le serveur le refuse. */
  protected async removeLast(): Promise<void> {
    const declared = this.declared();
    const last = declared.status === 'ready' ? lastLiveBin(declared.value) : null;
    if (last === null) {
      return;
    }
    await this.write(() => this.service.voidBin(last.binId), 'Le bac n’a pas pu être annulé.');
  }

  protected retry(): void {
    this.loadAll(this.orderId());
  }

  /** Écrit, puis relit les bacs — accepté ou refusé : ce qui s'affiche est ce qui est servi. */
  private async write(gesture: () => Promise<unknown>, fallback: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      await this.loadDeclared(this.orderId());
      this.busy.set(false);
    }
  }

  private loadAll(orderId: string): void {
    this.refusal.set(null);
    void this.loadTypes();
    void this.loadDeclared(orderId);
    void this.loadProposal(orderId);
  }

  private async loadTypes(): Promise<void> {
    this.types.set({ status: 'loading' });
    try {
      this.types.set({ status: 'ready', value: (await this.binTypes.binTypes()).types });
    } catch {
      this.types.set({ status: 'error' });
    }
  }

  private async loadDeclared(orderId: string): Promise<void> {
    try {
      const view = await this.service.orderBins(orderId);
      if (orderId === this.orderId()) {
        this.declared.set({ status: 'ready', value: view.bins });
      }
    } catch {
      if (orderId === this.orderId()) {
        this.declared.set({ status: 'error' });
      }
    }
  }

  private async loadProposal(orderId: string): Promise<void> {
    this.proposal.set(null);
    try {
      const view = await this.service.packingProposal(orderId);
      if (orderId === this.orderId()) {
        this.proposal.set(view);
      }
    } catch {
      // La couleur et le froid sont un confort : sans proposition, ils se taisent.
    }
  }
}
