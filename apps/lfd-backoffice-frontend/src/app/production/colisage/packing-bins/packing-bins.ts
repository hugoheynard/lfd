import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryBinFreeHalvesView,
  DeliveryBinView,
  DeliveryPackingBinView,
  DeliveryPackingProposalView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldSelectItem } from 'fold-ng';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import {
  declaredDiffersFromProposal,
  declaredSummary,
  freeHalfLabel,
  hasProposedBins,
  packingBinLabel,
  packingContentLabel,
  packingFillLabel,
  proposalDeclarations,
  proposalSummary,
  shareCandidateLabel,
  unplacedReasonLabel,
  withoutReplacedBin,
} from '../../../livraison/delivery-packing';

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

/** Une lecture du panneau : la proposition, ou les moitiés libres. */
type Loadable<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: T };

/**
 * **Déclarer les bacs d'une commande prête** (lot 4, L4-C16 et L4-C21 ; lot 4
 * bis, v2-4 et v2-7).
 *
 * Un bac naît quand on le DÉCLARE : un type (les types non archivés du
 * catalogue), N bacs entiers et, sur un type cloisonnable, une moitié de plus ;
 * les sacs posés dedans ne sont qu'un compte imprimé sur l'étiquette. Puis la
 * page d'étiquettes s'ouvre. Imprimer n'en crée aucun.
 *
 * En tête, le **colisage proposé** (L4b-C4, tranche C) : ce que le serveur
 * calcule, son contenu, et ce qu'il ne sait pas placer. « Déclarer comme
 * proposé » envoie une déclaration par entrée ; « Autre colisage » ouvre la
 * saisie libre. La déclaration fait foi : un écart avec la proposition se
 * RAPPELLE, il ne se refuse pas.
 *
 * Dernier recours (v2-4) : **partager une moitié** avec un demi-bac d'un arrêt
 * VOISIN de la même tournée — proposé par le serveur (`shareCandidate`), ou
 * choisi parmi les moitiés libres (`colisage/bacs/partenaires`). Le serveur
 * tranche, et son refus s'affiche tel quel.
 *
 * 🔴 Déclarer des bacs demande `production_packing:write` OU
 * `delivery_loading:write` — la porte du panneau s'ouvre aux deux depuis le
 * 2026-10-01 (`documentation/livraisons/plan-droits-par-geste.md`, 5.3).
 * Sans l'un ni l'autre, pas de bouton : une phrase dit où ça se fait.
 */
@Component({
  selector: 'app-packing-bins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
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
  protected readonly canDeclare = computed(
    () =>
      this.permissions.can('production_packing:write') ||
      this.permissions.can('delivery_loading:write'),
  );
  /** Renseigner une contenance est un réglage : le lien n'est offert qu'à qui peut l'écrire. */
  protected readonly canSetCapacities = computed(() =>
    this.permissions.can('delivery_settings:write'),
  );

  protected readonly open = signal(false);
  protected readonly types = signal<TypesState>({ status: 'loading' });
  protected readonly binTypeId = signal<string | null>(null);
  protected readonly whole = signal<number | null>(1);
  protected readonly half = signal(false);
  protected readonly innerBags = signal<number | null>(0);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly proposal = signal<Loadable<DeliveryPackingProposalView>>({
    status: 'loading',
  });
  protected readonly halves = signal<Loadable<DeliveryBinFreeHalvesView>>({ status: 'loading' });
  /** Les bacs déjà déclarés — `null` tant qu'ils ne sont pas lus (ou illisibles : aucun rappel). */
  protected readonly declared = signal<readonly DeliveryBinView[] | null>(null);
  /** La saisie libre de la tranche B, derrière « Autre colisage ». */
  protected readonly manual = signal(false);
  protected readonly sharing = signal(false);
  protected readonly partnerBinId = signal<string | null>(null);

  protected readonly binLabel = packingBinLabel;
  protected readonly fillLabel = packingFillLabel;
  protected readonly reasonLabel = unplacedReasonLabel;

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

  protected readonly summary = computed(() => {
    const state = this.proposal();
    return state.status === 'ready' ? proposalSummary(state.view.bins) : '';
  });

  /**
   * Des bacs non annulés existent déjà pour cette commande : « Déclarer comme
   * proposé » les DOUBLERAIT (relevé au bâti, 2026-09-29). La déclaration fait
   * foi — pour la refaire, on annule d'abord ; « Autre colisage » reste ouvert
   * pour ajouter un bac à la main.
   */
  protected readonly alreadyDeclared = computed(() =>
    (this.declared() ?? []).some((bin) => bin.voidedAt === null),
  );

  protected readonly proposable = computed(() => {
    const state = this.proposal();
    return (
      !this.alreadyDeclared() &&
      state.status === 'ready' &&
      hasProposedBins(state.view) &&
      inRange(this.innerBags(), 0, MAX_INNER_BAGS)
    );
  });

  /** Un produit sans contenance : le seul non-placé qu'un réglage répare. */
  protected readonly missingCapacity = computed(() => {
    const state = this.proposal();
    return (
      state.status === 'ready' && state.view.unplaced.some((item) => item.reason === 'no_capacity')
    );
  });

  /** La saisie libre s'ouvre d'elle-même quand il n'y a rien à suivre. */
  protected readonly showManual = computed(() => {
    const state = this.proposal();
    return (
      this.manual() ||
      state.status === 'error' ||
      (state.status === 'ready' && !hasProposedBins(state.view))
    );
  });

  /** « Déclaré : … » quand les bacs déclarés diffèrent de la proposition, sinon `null`. */
  protected readonly gap = computed(() => {
    const state = this.proposal();
    const declared = this.declared();
    if (state.status !== 'ready' || declared === null) {
      return null;
    }
    return declaredDiffersFromProposal(declared, state.view.bins)
      ? declaredSummary(declared)
      : null;
  });

  protected readonly shareSuggestion = computed(() => {
    const state = this.proposal();
    const halves = this.halves();
    if (state.status !== 'ready' || state.view.shareCandidate === null) {
      return null;
    }
    return shareCandidateLabel(
      state.view.shareCandidate,
      halves.status === 'ready' ? halves.view.halves : [],
    );
  });

  protected readonly partnerOptions = computed<readonly FoldSelectItem<string>[]>(() => {
    const state = this.halves();
    return state.status === 'ready'
      ? state.view.halves.map((half) => ({ value: half.binId, label: freeHalfLabel(half) }))
      : [];
  });

  /** La commande n'est dans aucune tournée non partie : rien à partager. */
  protected readonly unassigned = computed(() => {
    const state = this.halves();
    return (
      state.status === 'ready' &&
      (state.view.round === null || state.view.round.departedAt !== null)
    );
  });

  protected readonly sharable = computed(
    () => this.partnerBinId() !== null && inRange(this.innerBags(), 0, MAX_INNER_BAGS),
  );

  protected contentOf(bin: DeliveryPackingBinView): string {
    const state = this.proposal();
    return state.status === 'ready' ? packingContentLabel(bin, state.view.lines) : '';
  }

  protected labelsLink(): string[] {
    return ['/livraison/etiquettes', this.orderId()];
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    this.refusal.set(null);
    if (!this.open()) {
      return;
    }
    if (this.types().status !== 'ready') {
      void this.loadTypes();
    }
    void this.loadProposal();
    void this.loadHalves();
    void this.loadDeclared();
  }

  protected retryProposal(): void {
    void this.loadProposal();
  }

  protected retryHalves(): void {
    void this.loadHalves();
  }

  protected toggleManual(): void {
    this.manual.update((manual) => !manual);
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
      async () => (await this.service.declareBins(payload)).binIds,
      'Les bacs n’ont pas pu être déclarés.',
    );
  }

  /**
   * Déclare la proposition telle quelle — une déclaration par entrée, dans
   * l'ordre — ou, en dernier recours, la proposition moins le bac remplacé,
   * puis le partage de la moitié voisine.
   */
  protected async declareProposal(withShare: boolean): Promise<void> {
    const state = this.proposal();
    const innerBags = this.innerBags();
    if (state.status !== 'ready' || !inRange(innerBags, 0, MAX_INNER_BAGS)) {
      return;
    }
    const candidate = withShare ? state.view.shareCandidate : null;
    if (withShare && candidate === null) {
      return;
    }
    const bins =
      candidate === null
        ? state.view.bins
        : withoutReplacedBin(state.view.bins, candidate.replacesBinIndex);
    const payloads = proposalDeclarations(this.orderId(), bins, innerBags);
    await this.write(async () => {
      const binIds: string[] = [];
      for (const payload of payloads) {
        binIds.push(...(await this.service.declareBins(payload)).binIds);
      }
      if (candidate !== null) {
        const shared = await this.service.shareBin({
          orderId: this.orderId(),
          partnerBinId: candidate.partnerBinId,
          innerBags,
        });
        binIds.push(shared.binId);
      }
      return binIds;
    }, 'Les bacs proposés n’ont pas tous pu être déclarés.');
  }

  protected openSharing(): void {
    this.sharing.set(true);
    this.partnerBinId.set(null);
  }

  protected closeSharing(): void {
    this.sharing.set(false);
    this.partnerBinId.set(null);
  }

  protected async share(): Promise<void> {
    const partnerBinId = this.partnerBinId();
    const innerBags = this.innerBags();
    if (partnerBinId === null || !inRange(innerBags, 0, MAX_INNER_BAGS)) {
      return;
    }
    await this.write(
      async () => [
        (await this.service.shareBin({ orderId: this.orderId(), partnerBinId, innerBags })).binId,
      ],
      'La moitié n’a pas pu être partagée.',
    );
  }

  /**
   * Écrit, puis ouvre les étiquettes des SEULS bacs créés. Un refus reste ici,
   * tel quel — et l'on relit : une suite de déclarations interrompue a pu en
   * poser une partie, que le rappel d'écart dira.
   */
  private async write(gesture: () => Promise<readonly string[]>, fallback: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const binIds = await gesture();
      await this.router.navigate(this.labelsLink(), { queryParams: { bacs: binIds.join(',') } });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
      void this.loadDeclared();
      void this.loadHalves();
    } finally {
      this.busy.set(false);
    }
  }

  private async loadProposal(): Promise<void> {
    this.proposal.set({ status: 'loading' });
    try {
      this.proposal.set({
        status: 'ready',
        view: await this.service.packingProposal(this.orderId()),
      });
    } catch {
      this.proposal.set({ status: 'error' });
    }
  }

  private async loadHalves(): Promise<void> {
    this.halves.set({ status: 'loading' });
    try {
      this.halves.set({ status: 'ready', view: await this.service.freeHalves(this.orderId()) });
    } catch {
      this.halves.set({ status: 'error' });
    }
  }

  private async loadDeclared(): Promise<void> {
    try {
      this.declared.set((await this.service.orderBins(this.orderId())).bins);
    } catch {
      // Le rappel d'écart est un confort : sans les bacs déclarés, il se tait.
      this.declared.set(null);
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
}
