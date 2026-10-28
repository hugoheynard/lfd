import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { OrderSaleUnit, WorkshopLineContainer, WorkshopShortcutView } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/** Ce que le pavé reçoit de la ligne qui l'ouvre. */
export interface KeypadData {
  readonly productName: string;
  /** La valeur de départ : le manque du palier en cours, au moins une pièce. */
  readonly preset: number;
  /** Ce qui reste à sortir sur toute la ligne — la touche « Le reste ». */
  readonly remaining: number;
  readonly container: WorkshopLineContainer | null;
  readonly shortcuts: readonly WorkshopShortcutView[];
  /**
   * L'unité de l'article (plan `pricing/plan-vente-au-poids.md`, P6) : au
   * poids, la fournée se déclare en GRAMMES. Absente = des pièces.
   */
  readonly saleUnit?: OrderSaleUnit;
}

/** Une touche de raccourci : son mot, et la quantité qu'elle POSE. */
interface Preset {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

/** Quatre chiffres suffisent : personne ne sort 10 000 pièces d'une fournée. */
const MAX_DIGITS = 4;

/** Au poids, sept chiffres : la garde d'une tonne de la commande (P6). */
const MAX_WEIGHT_DIGITS = 7;

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * **Le pavé 3 × 4** (plan `documentation/fournil/plan-fournee-v3.md` §4.4) —
 * des touches qu'on vise les doigts farinés, à la place du champ et de son
 * clavier système qui recouvrait la fiche.
 *
 * Prérempli du manque du palier ; la première touche tapée REMPLACE la valeur
 * préremplie au lieu de s'y ajouter. Les raccourcis posent une valeur ; seul
 * « Déclarer » ferme sur une quantité.
 */
@Component({
  selector: 'app-workshop-keypad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './workshop-keypad.html',
  styleUrl: './workshop-keypad.scss',
})
export class WorkshopKeypad implements FoldPanelContent<KeypadData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  readonly data = input.required<KeypadData>();

  private readonly panel = inject(FoldPanelRef<number>);

  protected readonly digits = DIGITS;

  /** Ce qui est tapé. `null` = pas encore touché : la valeur préremplie vaut. */
  private readonly typed = signal<string | null>(null);

  protected readonly shown = computed(() => this.typed() ?? String(this.data().preset));
  protected readonly value = computed(() => Number.parseInt(this.shown() || '0', 10));
  protected readonly valid = computed(() => this.value() >= 1);

  /** Au poids, la fournée compte des grammes, dits « 1,25 kg ». */
  protected readonly byWeight = computed(() => this.data().saleUnit === 'weight');

  /** « 12 » ou « 1,25 kg » — une quantité dans l'unité de l'article. */
  protected figure(quantity: number): string {
    return saleQuantityLabel(quantity, this.data().saleUnit);
  }

  protected readonly presets = computed<readonly Preset[]>(() => {
    const data = this.data();
    const all: Preset[] = [
      { key: 'rest', label: `Le reste · ${this.figure(data.remaining)}`, value: data.remaining },
    ];
    if (data.container !== null) {
      const { singular, unitsPerContainer: units } = data.container;
      all.push(
        { key: 'one', label: `1 ${singular} · ${String(units)}`, value: units },
        { key: 'two', label: `2 ${singular}s · ${String(units * 2)}`, value: units * 2 },
      );
    }
    for (const shortcut of data.shortcuts) {
      all.push({
        key: shortcut.id,
        label: `${shortcut.label} · ${String(shortcut.pieces)}`,
        value: shortcut.pieces,
      });
    }
    return all.filter(
      (preset, index) =>
        preset.value >= 1 && all.findIndex((other) => other.value === preset.value) === index,
    );
  });

  /** « il restera 12 », « la ligne sera complète », « ligne complète, +6 ». */
  protected readonly after = computed(() => {
    const value = this.value();
    const remaining = this.data().remaining;
    if (value < 1) {
      return '';
    }
    if (value < remaining) {
      return `il restera ${this.figure(remaining - value)}`;
    }
    return value === remaining
      ? 'la ligne sera complète'
      : `ligne complète, +${this.figure(value - remaining)}`;
  });

  protected readonly declareLabel = computed(() => {
    const value = this.value();
    if (!this.valid()) {
      return 'Déclarer';
    }
    return this.byWeight()
      ? `Déclarer ${this.figure(value)}`
      : `Déclarer ${String(value)} pièce${value > 1 ? 's' : ''}`;
  });

  protected press(digit: string): void {
    const base = this.typed() ?? '';
    const next = (base === '0' ? '' : base) + digit;
    this.typed.set(next.slice(0, this.byWeight() ? MAX_WEIGHT_DIGITS : MAX_DIGITS));
  }

  protected erase(): void {
    this.typed.set(this.shown().slice(0, -1));
  }

  protected clear(): void {
    this.typed.set('');
  }

  protected pick(preset: Preset): void {
    this.typed.set(String(preset.value));
  }

  protected isPicked(preset: Preset): boolean {
    return this.value() === preset.value;
  }

  /** Fermer ne déclare rien. */
  protected close(): void {
    this.panel.close();
  }

  protected declare(): void {
    if (this.valid()) {
      this.panel.close(this.value());
    }
  }
}
