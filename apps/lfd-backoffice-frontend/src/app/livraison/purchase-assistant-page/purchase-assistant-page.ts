import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { PurchaseAssistantPayload, PurchaseAssistantView, VehicleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldIconComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  type FoldSelectItem,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import {
  type AssistantDraft,
  bestFormatIndex,
  buildPayload,
  DEFAULT_GAP_CM,
  type DimensionsDraft,
  EMPTY_FLOOR,
  emptyFormat,
  type FloorDraft,
  floorOfVehicle,
  type FormatDraft,
  formatLiters,
  formatsOfBinTypes,
  measuredVehicles,
  PURCHASE_ASSISTANT_MAX_FORMATS,
} from '../purchase-assistant';
import { PurchaseAssistantResult } from '../purchase-assistant-result/purchase-assistant-result';
import { PurchaseLibrary } from '../purchase-library/purchase-library';
import { PurchaseTable } from '../purchase-table/purchase-table';

/** Le temps de repos de la saisie avant de reposer la question au serveur. */
export const RECOMPUTE_DEBOUNCE_MS = 300;

/** La valeur du choix « Saisie libre » : aucun véhicule de la flotte. */
const FREE_ENTRY = '';

/** Les trois sujets de l'assistant : compter, la bibliothèque, le tableau croisé. */
export type PurchaseAssistantTab = 'calcul' | 'bibliotheque' | 'tableau';

const TABS: readonly FoldTabItem<PurchaseAssistantTab>[] = [
  { key: 'calcul', label: 'Calcul', icon: 'sliders' },
  { key: 'bibliotheque', label: 'Bibliothèque', icon: 'library' },
  { key: 'tableau', label: 'Tableau', icon: 'grid' },
];

/** Ce que la flotte et les bacs ont pu donner au premier affichage. */
interface Prefill {
  readonly vehicles: readonly VehicleView[];
  readonly fleetUnread: boolean;
  readonly binsUnread: boolean;
}

/** La réponse, avec la question qui l'a produite : le dessin suit ce qui a été calculé. */
export interface Computed {
  readonly view: PurchaseAssistantView;
  readonly payload: PurchaseAssistantPayload;
}

/**
 * **L'assistant d'achat** (`documentation/livraisons/plan-geometrie-du-plancher.md`,
 * G-D3, lot G3) : combien de bacs de tel format tiennent dans tel plancher.
 *
 * Le calcul est au serveur (`POST admin/livraison/assistant-achat`), reposé à
 * chaque saisie après un court repos ; un refus 400 s'affiche avec la phrase
 * du serveur, et aucun résultat ne reste à l'écran sur une question refusée.
 * Rien n'est écrit : ni véhicule, ni type de bac.
 *
 * Pré-rempli par un véhicule mesuré de la flotte et par les types de bacs en
 * service, lus sous `delivery_rounds:read` comme la page. Si leur lecture
 * échoue, les champs restent vides et l'écran le dit — aucune cote inventée.
 *
 * La bibliothèque d'achat et son tableau croisé (`plan-bibliotheque-d-achat.md`,
 * B4 et B5) sont deux ONGLETS de la même page, pas deux routes : c'est ce que
 * fait le dépôt pour les sous-sujets d'un écran (Fidélité, Liens de paiement),
 * et l'entrée de rail reste une.
 */
@Component({
  selector: 'app-purchase-assistant-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNavLayoutComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    PurchaseAssistantResult,
    PurchaseLibrary,
    PurchaseTable,
  ],
  templateUrl: './purchase-assistant-page.html',
  styleUrl: './purchase-assistant-page.scss',
})
export class PurchaseAssistantPage {
  private readonly bins = inject(DeliveryBinsService);
  private readonly fleet = inject(DeliverySettingsService);

  protected readonly tabs = TABS;
  protected readonly tab = signal<PurchaseAssistantTab>('calcul');

  protected readonly prefill = signal<Prefill | null>(null);
  protected readonly vehicleChoice = signal<string>(FREE_ENTRY);
  protected readonly draft = signal<AssistantDraft>({
    floor: EMPTY_FLOOR,
    gapCm: DEFAULT_GAP_CM,
    formats: [],
  });
  protected readonly calculating = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly result = signal<Computed | null>(null);

  protected readonly maxFormats = PURCHASE_ASSISTANT_MAX_FORMATS;
  protected readonly built = computed(() => buildPayload(this.draft()));
  protected readonly canAddFormat = computed(
    () => this.draft().formats.length < PURCHASE_ASSISTANT_MAX_FORMATS,
  );
  protected readonly vehicleOptions = computed<readonly FoldSelectItem<string>[]>(() => [
    ...(this.prefill()?.vehicles ?? []).map((vehicle) => ({
      value: vehicle.id,
      label: vehicle.name,
    })),
    { value: FREE_ENTRY, label: 'Saisie libre' },
  ]);
  protected readonly missingText = computed(() => {
    const built = this.built();
    return built.ok ? '' : built.missing.join(', ');
  });
  /** Chaque verdict avec le format envoyé qui l'a produit : le dessin a besoin de ses cotes. */
  protected readonly cards = computed(() => {
    const result = this.result();
    if (result === null) {
      return [];
    }
    const best = bestFormatIndex(result.view.formats);
    return result.view.formats.flatMap((format, index) => {
      const sent = result.payload.formats[index];
      return sent === undefined ? [] : [{ format, sent, best: best === index }];
    });
  });
  protected readonly vehicleVolume = computed(() => {
    const result = this.result();
    return result === null ? null : formatLiters(result.view.vehicleVolumeLiters);
  });

  /** Le numéro de la dernière question posée : une réponse plus ancienne est ignorée. */
  private asked = 0;

  constructor() {
    void this.load();
    effect((onCleanup) => {
      const built = this.built();
      if (this.prefill() === null) {
        return;
      }
      if (!built.ok) {
        this.asked += 1;
        this.calculating.set(false);
        this.result.set(null);
        this.refusal.set(null);
        return;
      }
      const timer = setTimeout(() => void this.ask(built.payload), RECOMPUTE_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected pickVehicle(id: string): void {
    this.vehicleChoice.set(id);
    const vehicle = this.prefill()?.vehicles.find((v) => v.id === id);
    if (vehicle !== undefined) {
      this.patchFloor(floorOfVehicle(vehicle, this.draft().floor));
    }
  }

  /** Retoucher une cote du véhicule en fait une saisie libre : le nom ne dirait plus vrai. */
  protected setVehicleDimension(patch: Partial<DimensionsDraft>): void {
    this.vehicleChoice.set(FREE_ENTRY);
    this.patchFloor({ ...this.draft().floor, ...patch });
  }

  protected setArches(patch: Partial<FloorDraft>): void {
    this.patchFloor({ ...this.draft().floor, ...patch });
  }

  protected setGap(gapCm: number | null): void {
    this.draft.set({ ...this.draft(), gapCm });
  }

  protected updateFormat(key: number, patch: Partial<FormatDraft>): void {
    this.patchFormats(
      this.draft().formats.map((format) => (format.key === key ? { ...format, ...patch } : format)),
    );
  }

  protected updateOuter(format: FormatDraft, patch: Partial<DimensionsDraft>): void {
    this.updateFormat(format.key, { outer: { ...format.outer, ...patch } });
  }

  protected updateInner(format: FormatDraft, patch: Partial<DimensionsDraft>): void {
    this.updateFormat(format.key, { inner: { ...format.inner, ...patch } });
  }

  protected addFormat(): void {
    if (this.canAddFormat()) {
      const formats = this.draft().formats;
      this.patchFormats([...formats, emptyFormat(formats)]);
    }
  }

  protected removeFormat(key: number): void {
    this.patchFormats(this.draft().formats.filter((format) => format.key !== key));
  }

  private patchFloor(floor: FloorDraft): void {
    this.draft.set({ ...this.draft(), floor });
  }

  private patchFormats(formats: readonly FormatDraft[]): void {
    this.draft.set({ ...this.draft(), formats });
  }

  private async ask(payload: PurchaseAssistantPayload): Promise<void> {
    this.asked += 1;
    const question = this.asked;
    this.calculating.set(true);
    try {
      const view = await this.bins.assistPurchase(payload);
      if (question === this.asked) {
        this.refusal.set(null);
        this.result.set({ view, payload });
      }
    } catch (error) {
      if (question === this.asked) {
        this.result.set(null);
        this.refusal.set(httpErrorMessage(error, 'Le calcul n’a pas pu être fait.'));
      }
    } finally {
      if (question === this.asked) {
        this.calculating.set(false);
      }
    }
  }

  private async load(): Promise<void> {
    const [fleet, bins] = await Promise.allSettled([this.fleet.vehicles(), this.bins.binTypes()]);
    const vehicles = fleet.status === 'fulfilled' ? measuredVehicles(fleet.value.vehicles) : [];
    const first = vehicles[0];
    this.draft.set({
      floor: first === undefined ? EMPTY_FLOOR : floorOfVehicle(first, EMPTY_FLOOR),
      gapCm: DEFAULT_GAP_CM,
      formats: bins.status === 'fulfilled' ? formatsOfBinTypes(bins.value.types) : [],
    });
    this.vehicleChoice.set(first === undefined ? FREE_ENTRY : first.id);
    this.prefill.set({
      vehicles,
      fleetUnread: fleet.status === 'rejected',
      binsUnread: bins.status === 'rejected',
    });
  }
}
