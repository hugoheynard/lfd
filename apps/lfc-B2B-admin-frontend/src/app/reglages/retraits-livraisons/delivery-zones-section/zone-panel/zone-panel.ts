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
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { CartAdjustmentField } from '../../cart-adjustment-field/cart-adjustment-field';
import { DeliveryZonesService } from '../../delivery-zones.service';

/** Charge d'ouverture : la zone à éditer, ou `null` pour en créer une. */
export interface ZonePanelData {
  readonly zone: DeliveryZoneView | null;
}

const PREFIX_RE = /^\d{2,5}$/u;

/** Découpe une saisie libre en préfixes (séparés par espace, virgule, retour). */
function parsePrefixes(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/u).map((token) => token.trim()).filter(Boolean))];
}

/**
 * Panneau **Zone de livraison** — crée ou édite un secteur de codes postaux +
 * son frais de livraison (% ou €, toujours présent). On saisit un ou plusieurs
 * **préfixes** (`73150` exact, `731` = secteur). Container mince : seede depuis
 * `data`, valide (≥1 préfixe 2-5 chiffres + frais), sauvegarde, ferme `true`.
 */
@Component({
  selector: 'app-zone-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldBadgeComponent,
    CartAdjustmentField,
  ],
  templateUrl: './zone-panel.html',
  styleUrl: './zone-panel.scss',
})
export class ZonePanel {
  private readonly zones = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ZonePanelData | undefined>(undefined);

  /** Saisie libre des codes postaux / préfixes (espaces ou virgules). */
  protected readonly prefixesText = signal('');
  protected readonly label = signal('');
  protected readonly fee = signal<CartAdjustment | null>(null);
  protected readonly saving = signal(false);

  /** Les préfixes valides extraits de la saisie (feedback + payload). */
  protected readonly prefixes = computed(() =>
    parsePrefixes(this.prefixesText()).filter((prefix) => PREFIX_RE.test(prefix)),
  );

  protected readonly isCreate = computed(() => (this.data()?.zone ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle zone de livraison' : 'Modifier la zone de livraison',
  );
  protected readonly canSubmit = computed(
    () => this.prefixes().length > 0 && this.fee() !== null,
  );

  constructor() {
    effect(() => {
      const zone = this.data()?.zone ?? null;
      if (zone === null) {
        return;
      }
      this.prefixesText.set(zone.postalPrefixes.join(' '));
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
      postalPrefixes: this.prefixes(),
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
