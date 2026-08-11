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
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { CartAdjustmentField } from '../../cart-adjustment-field/cart-adjustment-field';
import { DeliveryZonesService } from '../../delivery-zones.service';

/** Charge d'ouverture : la zone à éditer, ou `null` pour en créer une. */
export interface ZonePanelData {
  readonly zone: DeliveryZoneView | null;
}

/** Type d'une entrée : un code postal exact (5 chiffres) ou un préfixe de secteur. */
type RowType = 'postcode' | 'prefix';

/** Une ligne éditable — `id` stable (SSR-safe, compteur) pour le `track`. */
interface PrefixRow {
  readonly id: number;
  readonly type: RowType;
  readonly value: string;
}

const POSTCODE_RE = /^\d{5}$/u;
const PREFIX_RE = /^\d{2,4}$/u;

/** Une ligne est valide selon son type (code postal = 5 chiffres, préfixe = 2-4). */
function isRowValid(row: PrefixRow): boolean {
  const value = row.value.trim();
  return row.type === 'postcode' ? POSTCODE_RE.test(value) : PREFIX_RE.test(value);
}

/**
 * Panneau **Zone de livraison** — crée ou édite un secteur couvert + son frais de
 * livraison (% ou €, toujours présent). Le secteur est une **liste de lignes**,
 * chacune un **code postal** exact (`73150`) ou un **préfixe** de secteur (`731`).
 * En cas de chevauchement, le plus spécifique gagne (résolu serveur + client).
 * Le type est dérivé de la longueur à l'ouverture (5 chiffres = code postal).
 */
@Component({
  selector: 'app-zone-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldInputComponent,
    FoldSelectComponent,
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

  private seq = 1;
  /** Les lignes du secteur — une ligne vide par défaut (création). */
  protected readonly rows = signal<PrefixRow[]>([{ id: 0, type: 'postcode', value: '' }]);
  protected readonly label = signal('');
  protected readonly fee = signal<CartAdjustment | null>(null);
  protected readonly saving = signal(false);

  /** Les préfixes valides (dédupliqués) — payload + gate de soumission. */
  protected readonly prefixes = computed(() => [
    ...new Set(
      this.rows()
        .filter(isRowValid)
        .map((row) => row.value.trim()),
    ),
  ]);

  protected readonly isCreate = computed(() => (this.data()?.zone ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle zone de livraison' : 'Modifier la zone de livraison',
  );
  protected readonly canSubmit = computed(() => this.prefixes().length > 0 && this.fee() !== null);

  constructor() {
    // Édition : reconstruit les lignes depuis les préfixes (type dérivé de la
    // longueur, 5 chiffres = code postal exact).
    effect(() => {
      const zone = this.data()?.zone ?? null;
      if (zone === null) {
        return;
      }
      this.rows.set(
        zone.postalPrefixes.map((prefix) => ({
          id: this.seq++,
          type: prefix.length === 5 ? ('postcode' as const) : ('prefix' as const),
          value: prefix,
        })),
      );
      this.label.set(zone.label);
      this.fee.set(zone.fee);
    });
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, { id: this.seq++, type: 'postcode', value: '' }]);
  }

  protected removeRow(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }

  protected setType(id: number, type: RowType): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, type } : row)));
  }

  protected setValue(id: number, value: string): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, value } : row)));
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
