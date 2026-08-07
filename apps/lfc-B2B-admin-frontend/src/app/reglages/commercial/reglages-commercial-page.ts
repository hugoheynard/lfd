import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';
import type { MarketConfigView } from '@lfd/contracts';

import { MarketService } from '../../commercial/market/market.service';
import { AcquisitionSettingsService } from '../../commercial/settings/acquisition-settings.service';

/**
 * Sous-page **Commercial** des Réglages (staff). Deux cartes :
 * - **Alertes acquisition** : seuils ambre/rouge du calendrier (localStorage).
 * - **Marché ciblé** : zones (codes postaux) + codes NAF visés, avec le nombre
 *   d'acteurs *stocké* et un bouton **Redemander** qui réinterroge l'API entreprises.
 *   Ce dénominateur alimente l'adoption par territoire du dashboard Croissance.
 */
@Component({
  selector: 'app-reglages-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, DatePipe],
  templateUrl: './reglages-commercial-page.html',
  styleUrl: './reglages-commercial-page.scss',
})
export class ReglagesCommercialPage {
  protected readonly settings = inject(AcquisitionSettingsService);
  private readonly market = inject(MarketService);

  protected readonly config = signal<MarketConfigView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
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

  protected async addZone(codePostal: string): Promise<void> {
    const cp = codePostal.trim();
    if (!/^\d{5}$/u.test(cp)) {
      return;
    }
    await this.run(() => this.market.addZone(cp));
  }

  protected async removeZone(codePostal: string): Promise<void> {
    await this.run(() => this.market.removeZone(codePostal));
  }

  protected async addNaf(code: string, label: string): Promise<void> {
    const c = code.trim();
    const l = label.trim();
    if (c === '' || l === '') {
      return;
    }
    await this.run(() => this.market.addNaf(c, l));
  }

  protected async removeNaf(code: string): Promise<void> {
    await this.run(() => this.market.removeNaf(code));
  }

  protected async refresh(): Promise<void> {
    await this.run(() => this.market.refresh());
  }
}
