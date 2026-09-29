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
import type { VehiclePayload, VehicleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { DeliverySettingsService } from '../delivery-settings.service';

/** Ajouter (`vehicle` absent) ou corriger un véhicule. */
export interface VehicleDialogData {
  readonly vehicle?: VehicleView;
}

/** Les bornes du contrat (`vehiclePayloadSchema`), dites avant l'envoi. */
const NAME_MAX = 60;
const PLATE_MAX = 20;

/**
 * **Saisir un véhicule** : son nom et sa plaque, rien d'autre.
 *
 * Le dialogue écrit lui-même et ne se ferme que sur un succès (`true`) : un
 * refus du serveur — plaque mal formée, plaque déjà portée par un autre
 * véhicule actif, qu'il NOMME — reste affiché tel quel, dialogue ouvert, pour
 * qu'on corrige sans ressaisir. La plaque n'est pas normalisée ici : c'est le
 * value object du serveur qui fait foi, et le dupliquer ferait deux règles.
 */
@Component({
  selector: 'app-vehicle-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
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
  private readonly panel = inject(FoldPanelRef);

  protected readonly name = signal('');
  protected readonly plate = signal('');
  protected readonly saving = signal(false);
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
    return '';
  });

  /** En correction, rien n'a changé : Enregistrer n'a rien à écrire. */
  private readonly unchanged = computed(() => {
    const vehicle = this.data().vehicle;
    return (
      vehicle !== undefined &&
      vehicle.name === this.name().trim() &&
      vehicle.plate === this.plate().trim()
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
      });
    });
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    const payload: VehiclePayload = { name: this.name().trim(), plate: this.plate().trim() };
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
