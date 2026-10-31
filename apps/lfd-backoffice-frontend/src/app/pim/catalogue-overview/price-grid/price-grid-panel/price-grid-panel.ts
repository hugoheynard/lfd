import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type {
  DeliveryZoneView,
  PickupAddressView,
  PriceGridPromotionView,
  PriceGridPromotionsView,
  PriceGridQuestion,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSearchComponent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { DeliveryZonesService } from '../../../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../../../b2b/reglages/pickup-addresses.service';
import { AdminCompaniesService } from '../../../../comptes-clients/admin-companies.service';
import type { AdminCompany } from '../../../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../../../comptes-clients/company-search';
import { saveBlob } from '../../../../shared/download/save-blob';
import { effectPhrase } from '../../../../targeted-promotions/promotion-format';
import {
  AUDIENCE_OPTIONS,
  DEFAULT_PART,
  EMPTY_DRAFT,
  METHOD_OPTIONS,
  PART_OPTIONS,
  payloadOf,
  questionOf,
  type PriceGridDraft,
  type PriceGridPartChoice,
} from '../price-grid-draft';
import { PriceGridHttpApi } from '../price-grid-http-api';

/** Au-delà, on affine la recherche plutôt que de défiler. */
const MAX_RESULTS = 8;

type ListState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * **Exporter une grille de prix** (`plan-export-grille-de-prix.md`, § 2) : pour
 * qui, quand, comment il reçoit, quelles remises au panier et quelle partie,
 * et le prix au kilo saisi en option. La liste des promotions se relit à
 * chaque changement du public, du jour ou de l'acheminement.
 *
 * Lecture seule : le panneau télécharge un CSV et ne pose rien.
 */
@Component({
  selector: 'app-price-grid-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldSearchComponent,
  ],
  templateUrl: './price-grid-panel.html',
  styleUrl: './price-grid-panel.scss',
})
export class PriceGridPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  private readonly api = inject(PriceGridHttpApi);
  private readonly companies = inject(AdminCompaniesService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly zones = inject(DeliveryZonesService);
  private readonly ref = inject(FoldPanelRef<void>);

  protected readonly audienceOptions = AUDIENCE_OPTIONS;
  protected readonly methodOptions = METHOD_OPTIONS;
  protected readonly partOptions = PART_OPTIONS;
  protected readonly effectPhrase = effectPhrase;

  protected readonly draft = signal<PriceGridDraft>(EMPTY_DRAFT);
  protected readonly pricePerKg = signal(false);
  private readonly parts = signal<ReadonlyMap<string, PriceGridPartChoice>>(new Map());

  protected readonly places = signal<{
    readonly pickups: readonly PickupAddressView[];
    readonly zones: readonly DeliveryZoneView[];
  }>({ pickups: [], zones: [] });
  protected readonly placesError = signal<string | null>(null);

  private readonly allCompanies = signal<readonly AdminCompany[]>([]);
  protected readonly companiesState = signal<ListState>('idle');
  protected readonly companyQuery = signal('');

  protected readonly promotions = signal<PriceGridPromotionsView | null>(null);
  protected readonly promotionsState = signal<ListState>('idle');
  protected readonly promotionsError = signal<string | null>(null);

  protected readonly exporting = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly question = computed<PriceGridQuestion | null>(() => questionOf(this.draft()));

  protected readonly pickupOptions = computed(() =>
    this.places().pickups.map((point) => ({ value: point.id, label: point.label })),
  );
  protected readonly zoneOptions = computed(() =>
    this.places().zones.map((zone) => ({ value: zone.id, label: zone.label })),
  );

  protected readonly chosenCompany = computed(() => {
    const id = this.draft().companyId;
    return id === null ? null : (this.allCompanies().find((company) => company.id === id) ?? null);
  });

  protected readonly companyResults = computed<readonly AdminCompany[]>(() => {
    const query = this.companyQuery().trim();
    if (query === '') {
      return [];
    }
    return this.allCompanies()
      .filter((company) => company.status !== 'terminated')
      .filter((company) => matchesCompanySearch(company, query))
      .slice(0, MAX_RESULTS);
  });

  protected readonly canExport = computed(
    () => this.question() !== null && this.promotionsState() === 'ready' && !this.exporting(),
  );

  /** Garde contre une réponse arrivée après une question plus récente. */
  private asked = 0;

  constructor() {
    void this.loadPlaces();
    effect(() => {
      const question = this.question();
      untracked(() => void this.loadPromotions(question));
    });
  }

  protected edit(change: Partial<PriceGridDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.refusal.set(null);
  }

  /** Public : le choix d'un public se joue aussi depuis une suite. */
  chooseAudience(audience: PriceGridDraft['audience']): void {
    this.edit({ audience, companyId: null });
    if (audience === 'company' && this.companiesState() === 'idle') {
      void this.loadCompanies();
    }
  }

  protected chooseCompany(company: AdminCompany): void {
    this.edit({ companyId: company.id });
    this.companyQuery.set('');
  }

  protected nameOf(company: AdminCompany): string {
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  }

  protected partOf(promotion: PriceGridPromotionView): PriceGridPartChoice {
    return this.parts().get(promotion.id) ?? DEFAULT_PART;
  }

  protected setPart(promotion: PriceGridPromotionView, part: PriceGridPartChoice): void {
    this.parts.update((parts) => new Map(parts).set(promotion.id, part));
  }

  protected toggle(promotion: PriceGridPromotionView, checked: boolean): void {
    this.setPart(promotion, checked ? DEFAULT_PART : 'unchecked');
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected async exportGrid(): Promise<void> {
    const question = this.question();
    const view = this.promotions();
    if (question === null || view === null || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.refusal.set(null);
    try {
      const file = await this.api.export(
        payloadOf(question, view.basket, this.parts(), this.pricePerKg()),
      );
      saveBlob(file.blob, file.fileName);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La grille n’a pas pu être exportée.'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected async loadCompanies(): Promise<void> {
    this.companiesState.set('loading');
    try {
      this.allCompanies.set(await this.companies.list());
      this.companiesState.set('ready');
    } catch {
      this.companiesState.set('error');
    }
  }

  private async loadPlaces(): Promise<void> {
    try {
      const [pickups, zones] = await Promise.all([this.pickups.list(), this.zones.list()]);
      this.places.set({ pickups, zones });
      // Un seul point : il s'impose, comme à la caisse.
      const [only] = pickups;
      if (pickups.length === 1 && only !== undefined && this.draft().pickupId === null) {
        this.edit({ pickupId: only.id });
      }
    } catch (error) {
      this.placesError.set(httpErrorMessage(error, 'Les points et les zones n’ont pas été lus.'));
    }
  }

  private async loadPromotions(question: PriceGridQuestion | null): Promise<void> {
    const ticket = ++this.asked;
    if (question === null) {
      this.promotions.set(null);
      this.promotionsState.set('idle');
      return;
    }
    this.promotionsState.set('loading');
    try {
      const view = await this.api.promotions(question);
      if (ticket === this.asked) {
        this.promotions.set(view);
        this.promotionsState.set('ready');
      }
    } catch (error) {
      if (ticket === this.asked) {
        this.promotionsError.set(httpErrorMessage(error, 'Les promotions n’ont pas été lues.'));
        this.promotionsState.set('error');
      }
    }
  }
}
