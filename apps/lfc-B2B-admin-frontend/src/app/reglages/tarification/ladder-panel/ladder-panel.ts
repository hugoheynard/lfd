import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { PriceMode, PriceScopePayload, VolumeTierPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { nativeValue } from '../../../shared/native-input';
import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/** Charge d'ouverture : sur quoi le barème porte, et ce qui y est déjà posé. */
export interface LadderPanelData {
  readonly scope: PriceScopePayload;
  /** Ce que l'écran appelle cette cible — « Viennoiseries », « Croissant ». */
  readonly target: string;
  /** Les paliers en vigueur, ou `[]` si aucun barème n'est posé. */
  readonly tiers: readonly VolumeTierPayload[];
  readonly unit: PriceMode;
}

/** Un palier en cours de saisie : les champs sont vidables, donc `null`. */
interface DraftTier {
  minQuantity: number | null;
  value: number | null;
}

/**
 * **Le barème de volume — tous les paliers, d'un seul geste.**
 *
 * On saisit l'échelle entière parce que c'est une seule décision. Palier par
 * palier, il existerait un instant où « 50+ à −10 % » est posé et « 100+ à
 * −5 % » pas encore : un barème qui régresse, exactement ce que le serveur
 * refuse. Enregistrer d'un coup supprime cet instant.
 *
 * L'unité vaut pour TOUTE l'échelle : « 50+ à −5 %, 100+ à −0,20 € » ne se
 * compare pas sans connaître l'article, donc ne permet pas de vérifier que le
 * barème progresse.
 *
 * Le panneau ne trie pas et ne corrige pas : il montre ce qui cloche et laisse
 * l'auteur décider. Réordonner sous ses doigts lui ferait perdre la ligne qu'il
 * était en train d'écrire.
 */
@Component({
  selector: 'app-ladder-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent],
  templateUrl: './ladder-panel.html',
  styleUrl: './ladder-panel.scss',
})
export class LadderPanel {
  protected readonly nativeValue = nativeValue;

  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<LadderPanelData | undefined>(undefined);

  protected readonly unit = signal<PriceMode>('percent');
  protected readonly label = signal('');
  protected readonly validFrom = signal(today());
  protected readonly validTo = signal('');
  protected readonly saving = signal(false);
  protected readonly tiers = signal<readonly DraftTier[]>([{ minQuantity: null, value: null }]);

  protected readonly target = computed(() => this.data()?.target ?? '');

  /** Les paliers complets, dans l'ordre saisi — le tri appartient au serveur. */
  protected readonly filled = computed<readonly VolumeTierPayload[]>(() =>
    this.tiers()
      .filter(
        (tier): tier is { minQuantity: number; value: number } =>
          tier.minQuantity !== null && tier.value !== null,
      )
      .map((tier) => ({ minQuantity: tier.minQuantity, value: toWire(tier.value) })),
  );

  /**
   * **Ce qui cloche, dit avant l'envoi.**
   *
   * Le serveur refuse de toute façon — c'est lui qui garantit le modèle — mais
   * découvrir en cliquant qu'un barème régresse fait recommencer une saisie de
   * cinq lignes. L'écran le dit pendant qu'on écrit.
   */
  protected readonly problem = computed<string | null>(() => {
    const tiers = [...this.filled()].sort((left, right) => left.minQuantity - right.minQuantity);
    if (tiers.length === 0) {
      return 'Un barème porte au moins un palier complet.';
    }
    for (const [index, tier] of tiers.entries()) {
      const previous = tiers[index - 1];
      if (previous === undefined) {
        continue;
      }
      if (tier.minQuantity === previous.minQuantity) {
        return `Deux paliers à ${String(tier.minQuantity)} : lequel gagnerait ?`;
      }
      if (tier.value < previous.value) {
        return `Le palier ${String(tier.minQuantity)} accorde moins que le palier ${String(previous.minQuantity)} : commander plus y rapporterait moins.`;
      }
    }
    return null;
  });

  protected readonly canSubmit = computed(
    () => this.problem() === null && this.label().trim() !== '' && this.validFrom() !== '',
  );

  protected setUnit(unit: PriceMode): void {
    this.unit.set(unit);
  }

  protected addTier(): void {
    this.tiers.update((tiers) => [...tiers, { minQuantity: null, value: null }]);
  }

  /** Le dernier palier ne se retire pas : un barème sans palier n'existe pas. */
  protected removeTier(index: number): void {
    this.tiers.update((tiers) =>
      tiers.length <= 1 ? tiers : tiers.filter((_, position) => position !== index),
    );
  }

  protected setQuantity(index: number, raw: string): void {
    this.patch(index, { minQuantity: parseWhole(raw) });
  }

  protected setValue(index: number, raw: string): void {
    this.patch(index, { value: parseDecimal(raw) });
  }

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.setVolumeLadder({
        scope: data.scope,
        audience: { type: 'all', id: null },
        unit: this.unit(),
        tiers: [...this.filled()].sort((left, right) => left.minQuantity - right.minQuantity),
        label: this.label().trim(),
        validFrom: new Date(`${this.validFrom()}T00:00:00.000Z`).toISOString(),
        validTo:
          this.validTo() === '' ? null : new Date(`${this.validTo()}T00:00:00.000Z`).toISOString(),
      });
      this.notify.success('Barème de volume posé.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "Le barème n'a pas pu être posé.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  private patch(index: number, change: Partial<DraftTier>): void {
    this.tiers.update((tiers) =>
      tiers.map((tier, position) => (position === index ? { ...tier, ...change } : tier)),
    );
  }
}

/**
 * La valeur telle que le fil l'attend : points de base si `percent`, centimes si
 * `amount`.
 *
 * Le facteur est le même dans les deux cas — 5 % font 500 bp, 0,20 € font 20
 * centimes — et ce n'est pas une coïncidence à exploiter en silence : les deux
 * unités du modèle sont des centièmes de leur unité naturelle. Une seule
 * conversion suffit donc, et ce commentaire existe pour qu'on ne la « corrige »
 * pas en croyant à un oubli.
 */
function toWire(value: number): number {
  return Math.round(value * 100);
}

function parseWhole(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function parseDecimal(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  return raw.trim() === '' || Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/** Aujourd'hui en `YYYY-MM-DD`, le format qu'attend un `<input type="date">`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
