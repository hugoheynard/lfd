import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';
import type { MarketConfigView } from '@lfd/contracts';

import { MarketService } from '../../../commercial/market/market.service';

/** Un code postal français : cinq chiffres, ni plus ni moins. */
const POSTAL_CODE = /^\d{5}$/u;

/**
 * Section **Définition des marchés** : les zones (codes postaux) et les
 * catégories d'acteurs (codes NAF) que l'on vise.
 *
 * Le comptage vient de l'API publique des entreprises ; c'est le
 * **dénominateur** de l'adoption par territoire du dashboard Croissance. Sans
 * lui, une part de marché ne veut rien dire — d'où le total mis en avant, et le
 * rappel de sa fraîcheur.
 */
@Component({
  selector: 'app-market-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldButtonComponent,
    DatePipe,
    DecimalPipe,
    FoldCalloutComponent,
  ],
  templateUrl: './market-card.html',
  styleUrl: './market-card.scss',
})
export class MarketCard {
  private readonly market = inject(MarketService);

  protected readonly config = signal<MarketConfigView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  /** Le marché adressable total — la seule vraie tête de chapitre de l'écran. */
  protected readonly addressable = computed(() =>
    (this.config()?.zones ?? []).reduce((sum, zone) => sum + zone.addressable, 0),
  );

  /** Combien de zones attendent encore un comptage ? */
  protected readonly pendingCounts = computed(
    () => (this.config()?.zones ?? []).filter((zone) => zone.fetchedAt === null).length,
  );

  /** Les saisies d'ajout — locales à la carte, elles n'appellent qu'au clic. */
  protected readonly newZone = signal('');
  protected readonly newNafCode = signal('');
  protected readonly newNafLabel = signal('');

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.error.set(false);
    try {
      this.config.set(await this.market.config());
    } catch {
      this.error.set(true);
    }
  }

  /** Enveloppe une mutation : verrouille l'UI, applique la config renvoyée, gère l'échec. */
  private async run(mutation: () => Promise<MarketConfigView>): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    try {
      this.config.set(await mutation());
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async addZone(): Promise<void> {
    const cp = this.newZone().trim();
    if (!POSTAL_CODE.test(cp)) {
      return;
    }
    await this.run(() => this.market.addZone(cp));
    this.newZone.set('');
  }

  protected async removeZone(codePostal: string): Promise<void> {
    await this.run(() => this.market.removeZone(codePostal));
  }

  protected async addNaf(): Promise<void> {
    const code = this.newNafCode().trim();
    const label = this.newNafLabel().trim();
    if (code === '' || label === '') {
      return;
    }
    await this.run(() => this.market.addNaf(code, label));
    this.newNafCode.set('');
    this.newNafLabel.set('');
  }

  protected async removeNaf(code: string): Promise<void> {
    await this.run(() => this.market.removeNaf(code));
  }

  protected async refresh(): Promise<void> {
    await this.run(() => this.market.refresh());
  }
}
