import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CartAdjustment, DeliveryZonePayload, DeliveryZoneView } from '@lfd/contracts';
import { FoldButtonComponent, FoldInputComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { CartAdjustmentField } from '../../cart-adjustment-field/cart-adjustment-field';
import { DeliveryZonesService } from '../../delivery-zones.service';

/** Charge d'ouverture : la zone à éditer, ou `null` pour en créer une. */
export interface ZonePanelData {
  readonly zone: DeliveryZoneView | null;
}

const POSTAL_RE = /^\d{4,5}$/u;

/**
 * Panneau **Zone de livraison** — crée ou édite un code postal + son frais de
 * livraison (% ou €, toujours présent). Container mince : seede depuis `data`,
 * valide (code postal 4-5 chiffres + frais saisi), sauvegarde, ferme `true`.
 */
@Component({
  selector: 'app-zone-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent, CartAdjustmentField],
  templateUrl: './zone-panel.html',
  styleUrl: './zone-panel.scss',
})
export class ZonePanel {
  private readonly zones = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ZonePanelData | undefined>(undefined);

  protected readonly codePostal = signal('');
  protected readonly label = signal('');
  protected readonly fee = signal<CartAdjustment | null>(null);
  protected readonly saving = signal(false);

  protected readonly isCreate = computed(() => (this.data()?.zone ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle zone de livraison' : 'Modifier la zone de livraison',
  );
  protected readonly canSubmit = computed(
    () => POSTAL_RE.test(this.codePostal().trim()) && this.fee() !== null,
  );

  constructor() {
    effect(() => {
      const zone = this.data()?.zone ?? null;
      if (zone === null) {
        return;
      }
      this.codePostal.set(zone.codePostal);
      this.label.set(zone.label);
      this.fee.set(zone.fee);
    });
  }

  protected async submit(): Promise<void> {
    const fee = this.fee();
    const zone = this.data()?.zone ?? null;
    if (!this.canSubmit() || fee === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    const payload: DeliveryZonePayload = {
      codePostal: this.codePostal().trim(),
      label: this.label().trim(),
      fee,
    };
    try {
      if (zone === null) {
        await this.zones.create(payload);
        this.notify.success('Zone de livraison ajoutée.');
      } else {
        await this.zones.update(zone.id, payload);
        this.notify.success('Zone de livraison mise à jour.');
      }
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
