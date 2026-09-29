import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryLoadingRoundView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldSelectItem } from 'fold-ng';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { sharePartners, type SharePartner } from '../../../livraison/delivery-loading';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';

/**
 * Au plus tant de bacs entiers par déclaration, et tant de sacs par bac — les
 * bornes du contrat (`DELIVERY_BINS_PER_DECLARATION_MAX`,
 * `DELIVERY_BIN_INNER_BAGS_MAX`), recopiées : la VALEUR du contrat tirerait zod
 * dans le paquet du poste pour deux entiers. Le domaine les tient (400).
 */
const MAX_WHOLE = 20;
const MAX_INNER_BAGS = 50;

/** Ce que le formulaire tient avant d'être envoyé. */
export interface BinsDraft {
  readonly binTypeId: string | null;
  readonly whole: number | null;
  /** Une moitié de plus — n'a de sens que sur un type cloisonnable. */
  readonly half: boolean;
  readonly innerBags: number | null;
}

function inRange(value: number | null, min: number, max: number): value is number {
  return value !== null && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * La déclaration à envoyer, ou `null` tant qu'elle n'est pas complète : un
 * type choisi, un nombre ENTIER de bacs dans la borne, au moins un bac (un
 * entier ou la moitié). La moitié n'est gardée que si le type la permet.
 */
export function declarablePayload(
  orderId: string,
  draft: BinsDraft,
  type: Pick<BinTypeView, 'divisible'> | null,
): DeclareDeliveryBinsPayload | null {
  if (draft.binTypeId === null || type === null) {
    return null;
  }
  const half = draft.half && type.divisible;
  if (!inRange(draft.whole, 0, MAX_WHOLE) || !inRange(draft.innerBags, 0, MAX_INNER_BAGS)) {
    return null;
  }
  if (draft.whole === 0 && !half) {
    return null;
  }
  return {
    orderId,
    binTypeId: draft.binTypeId,
    whole: draft.whole,
    half,
    innerBags: draft.innerBags,
  };
}

type TypesState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly types: readonly BinTypeView[] };

type PartnersState =
  | { readonly status: 'closed' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** La commande n'est dans aucune tournée vivante de la journée : rien à partager. */
  | { readonly status: 'unassigned' }
  | { readonly status: 'ready'; readonly partners: readonly SharePartner[] };

/**
 * **Déclarer les bacs d'une commande prête** (lot 4, L4-C16 et L4-C21 ; lot 4
 * bis, v2-4 et v2-7).
 *
 * Un bac naît quand on le DÉCLARE : un type (les types non archivés du
 * catalogue), N bacs entiers et, sur un type cloisonnable, une moitié de plus ;
 * les sacs posés dedans ne sont qu'un compte imprimé sur l'étiquette. Puis la
 * page d'étiquettes s'ouvre. Imprimer n'en crée aucun.
 *
 * Dernier recours (v2-4) : **partager une moitié** avec un demi-bac d'un arrêt
 * VOISIN de la même tournée. Les moitiés proposées sont lues au chargement de
 * la journée ; le serveur tranche, et son refus s'affiche tel quel.
 *
 * 🔴 Le colisage est ouvert à qui écrit les commandes ; déclarer des bacs
 * demande `delivery_loading:write`, que seuls `admin` et `comptoir` ont (Q21).
 * Sans lui, pas de bouton : une phrase dit où ça se fait.
 */
@Component({
  selector: 'app-packing-bins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    RouterLink,
  ],
  templateUrl: './packing-bins.html',
  styleUrl: './packing-bins.scss',
})
export class PackingBins {
  private readonly service = inject(DeliveryLoadingService);
  private readonly bins = inject(DeliveryBinsService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsStore);

  /** La commande — l'identifiant du commerce, que porte la feuille de colisage. */
  readonly orderId = input.required<string>();
  /** La journée ouverte au poste (`AAAA-MM-JJ`) : où chercher la tournée de la commande. */
  readonly day = input.required<string>();

  protected readonly canDeclare = computed(() => this.permissions.can('delivery_loading:write'));

  protected readonly open = signal(false);
  protected readonly types = signal<TypesState>({ status: 'loading' });
  protected readonly binTypeId = signal<string | null>(null);
  protected readonly whole = signal<number | null>(1);
  protected readonly half = signal(false);
  protected readonly innerBags = signal<number | null>(0);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly partners = signal<PartnersState>({ status: 'closed' });
  protected readonly partnerBinId = signal<string | null>(null);

  protected readonly maxWhole = MAX_WHOLE;
  protected readonly maxInnerBags = MAX_INNER_BAGS;

  /** Les types proposés : jamais un type archivé (v2-7). */
  protected readonly typeOptions = computed<readonly FoldSelectItem<string>[]>(() => {
    const state = this.types();
    return state.status === 'ready'
      ? state.types
          .filter((type) => type.archivedAt === null)
          .map((type) => ({ value: type.id, label: type.name }))
      : [];
  });

  protected readonly chosenType = computed(() => {
    const state = this.types();
    const id = this.binTypeId();
    return state.status === 'ready' ? (state.types.find((type) => type.id === id) ?? null) : null;
  });

  protected readonly declarable = computed(() =>
    declarablePayload(
      this.orderId(),
      {
        binTypeId: this.binTypeId(),
        whole: this.whole(),
        half: this.half(),
        innerBags: this.innerBags(),
      },
      this.chosenType(),
    ),
  );

  protected readonly partnerOptions = computed<readonly FoldSelectItem<string>[]>(() => {
    const state = this.partners();
    return state.status === 'ready'
      ? state.partners.map((partner) => ({ value: partner.binId, label: partner.label }))
      : [];
  });

  protected readonly sharable = computed(
    () => this.partnerBinId() !== null && inRange(this.innerBags(), 0, MAX_INNER_BAGS),
  );

  protected labelsLink(): string[] {
    return ['/livraison/etiquettes', this.orderId()];
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    this.refusal.set(null);
    if (this.open() && this.types().status !== 'ready') {
      void this.loadTypes();
    }
  }

  protected retryTypes(): void {
    void this.loadTypes();
  }

  protected pickType(id: string | null): void {
    this.binTypeId.set(id);
    if (this.chosenType()?.divisible !== true) {
      this.half.set(false);
    }
  }

  /** Déclare les bacs, puis ouvre leurs étiquettes. Un refus reste ici, tel quel. */
  protected async declare(): Promise<void> {
    const payload = this.declarable();
    if (payload === null) {
      return;
    }
    await this.write(
      () => this.service.declareBins(payload),
      'Les bacs n’ont pas pu être déclarés.',
    );
  }

  /** Ouvre le partage : cherche la tournée de la commande, et ses moitiés voisines libres. */
  protected async openSharing(): Promise<void> {
    this.partners.set({ status: 'loading' });
    this.partnerBinId.set(null);
    try {
      const round = await this.roundOfOrder();
      this.partners.set(
        round === null
          ? { status: 'unassigned' }
          : { status: 'ready', partners: sharePartners(round, this.orderId()) },
      );
    } catch {
      this.partners.set({ status: 'error' });
    }
  }

  protected closeSharing(): void {
    this.partners.set({ status: 'closed' });
    this.partnerBinId.set(null);
  }

  protected async share(): Promise<void> {
    const partnerBinId = this.partnerBinId();
    const innerBags = this.innerBags();
    if (partnerBinId === null || !inRange(innerBags, 0, MAX_INNER_BAGS)) {
      return;
    }
    await this.write(
      () => this.service.shareBin({ orderId: this.orderId(), partnerBinId, innerBags }),
      'La moitié n’a pas pu être partagée.',
    );
  }

  private async write(gesture: () => Promise<void>, fallback: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      await this.router.navigate(this.labelsLink());
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadTypes(): Promise<void> {
    this.types.set({ status: 'loading' });
    try {
      const { types } = await this.bins.binTypes();
      this.types.set({ status: 'ready', types });
    } catch {
      this.types.set({ status: 'error' });
    }
  }

  /**
   * La tournée vivante (pas partie) du jour qui porte la commande, ou `null`.
   * Le contrat n'a pas de lecture « la tournée d'une commande » : on relit les
   * tournées du jour une à une — une par véhicule et passage, quelques-unes.
   */
  private async roundOfOrder(): Promise<DeliveryLoadingRoundView | null> {
    const { rounds } = await this.service.day(this.day());
    for (const summary of rounds) {
      if (summary.departedAt !== null || summary.stops === 0) {
        continue;
      }
      const round = await this.service.round(summary.roundId);
      if (round.stops.some((stop) => stop.orderId === this.orderId())) {
        return round;
      }
    }
    return null;
  }
}
