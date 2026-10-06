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
import type { DeliveryZoneView, VehicleEnergy, VehiclePayload, VehicleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldMultiselectComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import {
  CARGO_CM_MAX,
  CARGO_CM_MIN,
  COLD_LITERS_MAX,
  COLD_LITERS_MIN,
  COLD_TEMP_MAX,
  COLD_TEMP_MIN,
  draftVolumeLiters,
  ENERGY_OPTIONS,
  loadDraftOf,
  readLoad,
  volumeLabel,
  type VehicleLoadDraft,
} from '../vehicle-load';
import { sameZones, zoneOptionsOf } from '../vehicle-zones';

/** Ajouter (`vehicle` absent) ou corriger un véhicule. */
export interface VehicleDialogData {
  readonly vehicle?: VehicleView;
}

/** Les bornes du contrat (`vehiclePayloadSchema`), dites avant l'envoi. */
const NAME_MAX = 60;
const PLATE_MAX = 20;

/**
 * **Saisir un véhicule** : son nom, sa plaque, son énergie, et ce qu'il emporte — les
 * dimensions utiles et la caisse réfrigérée (lot 2 bis).
 *
 * Le dialogue écrit lui-même et ne se ferme que sur un succès (`true`) : un
 * refus du serveur — plaque mal formée, plaque déjà portée par un autre
 * véhicule actif, qu'il NOMME — reste affiché tel quel, dialogue ouvert, pour
 * qu'on corrige sans ressaisir. La plaque n'est pas normalisée ici : c'est le
 * value object du serveur qui fait foi, et le dupliquer ferait deux règles.
 *
 * La charge part toujours COMPLÈTE — passages de roue compris (G4) : absent vaut `null` côté serveur, donc
 * une correction qui omettrait les dimensions ou l'énergie les effacerait. Les
 * zones autorisées aussi (2026-10-06) : absentes, elles valent « partout ».
 */
@Component({
  selector: 'app-vehicle-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldMultiselectComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './vehicle-dialog.html',
  styleUrl: './vehicle-dialog.scss',
})
export class VehicleDialog implements FoldPanelContent<VehicleDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<VehicleDialogData>();

  private readonly api = inject(DeliverySettingsService);
  private readonly zonesApi = inject(DeliveryZonesService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly name = signal('');
  protected readonly plate = signal('');
  protected readonly energy = signal<VehicleEnergy | null>(null);
  protected readonly energyOptions = ENERGY_OPTIONS;
  protected readonly load = signal<VehicleLoadDraft>(loadDraftOf(undefined));
  protected readonly saving = signal(false);
  /** Les zones autorisées choisies ; vide = partout (2026-10-06). */
  protected readonly allowedZoneIds = signal<readonly string[]>([]);
  private readonly zones = signal<readonly DeliveryZoneView[]>([]);
  /** La liste des zones n'a pas pu être lue : on garde ce qui est choisi, et on le dit. */
  protected readonly zonesUnavailable = signal(false);
  protected readonly zoneOptions = computed(() =>
    zoneOptionsOf(this.zones(), this.allowedZoneIds()),
  );

  protected readonly bounds = {
    cmMin: CARGO_CM_MIN,
    cmMax: CARGO_CM_MAX,
    litersMin: COLD_LITERS_MIN,
    litersMax: COLD_LITERS_MAX,
    tempMin: COLD_TEMP_MIN,
    tempMax: COLD_TEMP_MAX,
  } as const;

  private readonly reading = computed(() => readLoad(this.load()));

  /** Le refus du chargement, dit sous les champs — ou `''`. */
  protected readonly loadIssue = computed(() => {
    const reading = this.reading();
    return reading.ok ? '' : reading.issue;
  });

  /** Les passages de roue ne se proposent qu'avec l'espace utile : le serveur les refuse sans. */
  protected readonly hasCargo = computed(() => draftVolumeLiters(this.load()) !== null);

  /** « 5,5 m³ », en direct — ou `null` tant que les trois dimensions manquent. */
  protected readonly volume = computed(() => {
    const liters = draftVolumeLiters(this.load());
    return liters === null ? null : volumeLabel(liters);
  });
  protected readonly refusal = signal<string | null>(null);

  protected readonly isCreate = computed(() => this.data().vehicle === undefined);
  protected readonly title = computed(() =>
    this.isCreate() ? 'Ajouter un véhicule' : 'Corriger le véhicule',
  );

  /** Ce qui empêche l'envoi, avec les mots du contrat — ou `''`. */
  protected readonly issue = computed(() => {
    const name = this.name().trim();
    const plate = this.plate().trim();
    if (name === '') return 'Nommez le véhicule.';
    if (name.length > NAME_MAX) return `Nom trop long (${String(NAME_MAX)} caractères au plus).`;
    if (plate === '') return 'Saisissez la plaque.';
    if (plate.length > PLATE_MAX) return 'Plaque trop longue.';
    return this.loadIssue();
  });

  /** En correction, rien n'a changé : Enregistrer n'a rien à écrire. */
  private readonly unchanged = computed(() => {
    const vehicle = this.data().vehicle;
    return (
      vehicle !== undefined &&
      vehicle.name === this.name().trim() &&
      vehicle.plate === this.plate().trim() &&
      vehicle.energy === this.energy() &&
      sameZones(vehicle.allowedZoneIds, this.allowedZoneIds()) &&
      // Ce qui PARTIRAIT, pas la saisie : décocher puis recocher le froid
      // sans rien changer n'est pas une correction.
      JSON.stringify(readLoad(loadDraftOf(vehicle))) === JSON.stringify(this.reading())
    );
  });

  protected readonly canSubmit = computed(
    () => this.issue() === '' && !this.unchanged() && !this.saving(),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const vehicle = this.data().vehicle;
      untracked(() => {
        this.name.set(vehicle?.name ?? '');
        this.plate.set(vehicle?.plate ?? '');
        this.energy.set(vehicle?.energy ?? null);
        this.load.set(loadDraftOf(vehicle));
        this.allowedZoneIds.set(vehicle?.allowedZoneIds ?? []);
      });
    });
    void this.loadZones();
  }

  private async loadZones(): Promise<void> {
    try {
      this.zones.set(await this.zonesApi.list());
    } catch {
      this.zonesUnavailable.set(true);
    }
  }

  /** Pose un champ du chargement ; les autres restent. */
  protected setLoad<K extends keyof VehicleLoadDraft>(key: K, value: VehicleLoadDraft[K]): void {
    this.load.set({ ...this.load(), [key]: value });
  }

  protected async submit(): Promise<void> {
    const reading = this.reading();
    if (!this.canSubmit() || !reading.ok) {
      return;
    }
    const payload: VehiclePayload = {
      name: this.name().trim(),
      plate: this.plate().trim(),
      cargo: reading.cargo,
      // Toujours envoyés : absent EFFACE côté serveur (G4).
      wheelArches: reading.wheelArches,
      refrigeration: reading.refrigeration,
      energy: this.energy(),
      allowedZoneIds: [...this.allowedZoneIds()],
    };
    const vehicle = this.data().vehicle;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      if (vehicle === undefined) {
        await this.api.addVehicle(payload);
      } else {
        await this.api.updateVehicle(vehicle.id, payload);
      }
      this.panel.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le véhicule n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close(false);
  }
}
