import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  PURCHASE_TABLE_MAX_FORMATS,
  PURCHASE_TABLE_MAX_VEHICLES,
  type PurchaseScenarioDisplay,
  type PurchaseScenarioIssueView,
  type PurchaseScenarioView,
  type PurchaseTablePayload,
  type PurchaseTableView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { DEFAULT_GAP_CM } from '../purchase-assistant';
import { PurchaseLibraryService } from '../purchase-library.service';
import {
  type CurrentPurchaseScenario,
  PurchaseScenarioSave,
} from '../purchase-scenario-save/purchase-scenario-save';
import { issueKey, restoredKeys } from '../purchase-scenarios';
import { PurchaseScenarios } from '../purchase-scenarios/purchase-scenarios';
import { PurchaseScenariosService } from '../purchase-scenarios.service';
import {
  CRITERION_OPTIONS,
  type FormatChoice,
  formatChoices,
  pickedRefs,
  type PurchaseTableCriterion,
  toggleKey,
  type VehicleChoice,
  vehicleChoices,
} from '../purchase-table';
import { PurchaseTableGrid } from '../purchase-table-grid/purchase-table-grid';

/** Ce que les quatre lectures ont pu donner. */
interface Choices {
  readonly vehicles: readonly VehicleChoice[];
  readonly formats: readonly FormatChoice[];
  /** Les sources qui n'ont pas pu être lues, nommées. */
  readonly unread: readonly string[];
}

/**
 * **Le tableau croisé** de la bibliothèque d'achat
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D4, lot B5) :
 * des véhicules (candidats, ou de la flotte avec leur espace utile) × des
 * formats (candidats, ou types en service), dix de chaque au plus.
 *
 * Le calcul et le classement sont au serveur ; l'écran choisit le critère et
 * met en avant la case que le serveur désigne. Le coût par litre est toujours
 * rendu, mais masqué tant qu'on ne le demande pas (Q3). Un refus (404 d'un
 * candidat disparu, 409 d'un archivé) s'affiche avec la phrase du serveur.
 *
 * Les **scénarios** (B-D5, lot B3) : ouvrir en remet la sélection, le jeu et
 * le critère dans les cases ; un élément archivé ou disparu depuis n'est pas
 * coché, il est NOMMÉ à part et se retire. Enregistrer et remplacer demandent
 * `delivery_rounds:write` — les boutons disparaissent sans.
 */
@Component({
  selector: 'app-purchase-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    PurchaseScenarioSave,
    PurchaseScenarios,
    PurchaseTableGrid,
  ],
  templateUrl: './purchase-table.html',
  styleUrl: './purchase-table.scss',
})
export class PurchaseTable {
  private readonly library = inject(PurchaseLibraryService);
  private readonly fleet = inject(DeliverySettingsService);
  private readonly bins = inject(DeliveryBinsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly scenarios = inject(PurchaseScenariosService);

  protected readonly maxVehicles = PURCHASE_TABLE_MAX_VEHICLES;
  protected readonly maxFormats = PURCHASE_TABLE_MAX_FORMATS;

  protected readonly choices = signal<Choices | null>(null);
  protected readonly vehicleKeys = signal<readonly string[]>([]);
  protected readonly formatKeys = signal<readonly string[]>([]);
  protected readonly gapCm = signal<number | null>(DEFAULT_GAP_CM);
  protected readonly criterion = signal<PurchaseTableCriterion>('occupation');
  protected readonly showCostPerLiter = signal(false);
  protected readonly calculating = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly result = signal<PurchaseTableView | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
  /** Le scénario dont vient la sélection, `null` s'il n'en vient d'aucun. */
  protected readonly current = signal<CurrentPurchaseScenario | null>(null);
  /** Ce que le scénario ouvert cite et qui ne passerait plus au tableau. */
  protected readonly issues = signal<readonly PurchaseScenarioIssueView[]>([]);
  /** Change à chaque enregistrement : la liste des scénarios se relit. */
  protected readonly revision = signal(0);
  protected readonly display = computed<PurchaseScenarioDisplay>(() => ({
    criterion: this.criterion(),
    showCostPerLiter: this.showCostPerLiter(),
  }));

  /** Le coût par litre ne se choisit comme critère que s'il est affiché. */
  protected readonly criterionOptions = computed(() =>
    this.showCostPerLiter()
      ? CRITERION_OPTIONS
      : CRITERION_OPTIONS.filter((option) => option.value !== 'costPerLiter'),
  );

  protected readonly payload = computed<PurchaseTablePayload | null>(() => {
    const choices = this.choices();
    const gapCm = this.gapCm();
    if (choices === null || gapCm === null) return null;
    const vehicles = pickedRefs(choices.vehicles, this.vehicleKeys(), (choice) => choice.ref);
    const formats = pickedRefs(choices.formats, this.formatKeys(), (choice) => choice.ref);
    if (vehicles.length === 0 || formats.length === 0) return null;
    return { vehicles: [...vehicles], formats: [...formats], gapCm };
  });

  protected readonly vehiclesFull = computed(
    () => this.vehicleKeys().length >= PURCHASE_TABLE_MAX_VEHICLES,
  );
  protected readonly formatsFull = computed(
    () => this.formatKeys().length >= PURCHASE_TABLE_MAX_FORMATS,
  );

  constructor() {
    void this.load();
  }

  protected isVehiclePicked(key: string): boolean {
    return this.vehicleKeys().includes(key);
  }

  protected isFormatPicked(key: string): boolean {
    return this.formatKeys().includes(key);
  }

  protected pickVehicle(key: string, checked: boolean): void {
    this.vehicleKeys.set(toggleKey(this.vehicleKeys(), key, checked, PURCHASE_TABLE_MAX_VEHICLES));
  }

  protected pickFormat(key: string, checked: boolean): void {
    this.formatKeys.set(toggleKey(this.formatKeys(), key, checked, PURCHASE_TABLE_MAX_FORMATS));
  }

  protected setShowCostPerLiter(show: boolean): void {
    this.showCostPerLiter.set(show);
    if (!show && this.criterion() === 'costPerLiter') {
      this.criterion.set('occupation');
    }
  }

  protected async compute(): Promise<void> {
    const payload = this.payload();
    if (payload === null || this.calculating()) return;
    this.calculating.set(true);
    this.refusal.set(null);
    try {
      this.result.set(await this.library.table(payload));
    } catch (error) {
      this.result.set(null);
      this.refusal.set(httpErrorMessage(error, 'Le tableau n’a pas pu être calculé.'));
    } finally {
      this.calculating.set(false);
    }
  }

  protected async openScenario(id: string): Promise<void> {
    this.refusal.set(null);
    try {
      this.restore(await this.scenarios.open(id));
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Ce scénario n’a pas pu être ouvert.'));
      return;
    }
    if (this.issues().length === 0) {
      await this.compute();
    }
  }

  /** Retiré de l'écran : il n'était déjà pas coché, et ne repartira pas au prochain enregistrement. */
  protected dropIssue(issue: PurchaseScenarioIssueView): void {
    this.issues.update((issues) => issues.filter((i) => issueKey(i) !== issueKey(issue)));
  }

  protected onSaved(saved: CurrentPurchaseScenario): void {
    this.current.set(saved);
    this.issues.set([]);
    this.revision.update((n) => n + 1);
  }

  /** Archivé, le scénario ouvert n'existe plus pour l'équipe : l'écran l'oublie. */
  protected forget(id: string): void {
    if (this.current()?.id === id) this.current.set(null);
  }

  private restore(view: PurchaseScenarioView): void {
    const choices = this.choices();
    this.vehicleKeys.set(restoredKeys(view.selection.vehicles, choices?.vehicles ?? []));
    this.formatKeys.set(restoredKeys(view.selection.formats, choices?.formats ?? []));
    this.gapCm.set(view.selection.gapCm);
    if (view.display !== null) {
      this.showCostPerLiter.set(view.display.showCostPerLiter);
      this.criterion.set(view.display.criterion);
    }
    this.issues.set(view.issues);
    this.current.set({ id: view.id, name: view.name });
    this.result.set(null);
  }

  private async load(): Promise<void> {
    const [vehicleCandidates, fleet, binCandidates, binTypes] = await Promise.allSettled([
      this.library.vehicleCandidates(false),
      this.fleet.vehicles(),
      this.library.binCandidates(false),
      this.bins.binTypes(),
    ]);
    const unread = [
      vehicleCandidates.status === 'rejected' ? 'les véhicules candidats' : null,
      fleet.status === 'rejected' ? 'la flotte' : null,
      binCandidates.status === 'rejected' ? 'les formats candidats' : null,
      binTypes.status === 'rejected' ? 'les types de bacs' : null,
    ].filter((source) => source !== null);
    this.choices.set({
      vehicles: vehicleChoices(
        vehicleCandidates.status === 'fulfilled' ? vehicleCandidates.value.candidates : [],
        fleet.status === 'fulfilled' ? fleet.value.vehicles : [],
      ),
      formats: formatChoices(
        binCandidates.status === 'fulfilled' ? binCandidates.value.candidates : [],
        binTypes.status === 'fulfilled' ? binTypes.value.types : [],
      ),
      unread,
    });
  }
}
