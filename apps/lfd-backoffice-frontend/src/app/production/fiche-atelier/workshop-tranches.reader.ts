import { computed, inject, Injectable, signal } from '@angular/core';

import type { DueThresholdView, ProductionDueThresholdsView } from '@lfd/contracts';

import { ProductionService } from '../production.service';

/**
 * **Les tranches de la journée**, lues pour la fiche d'atelier (plan
 * `documentation/fournil/plan-tranches-de-production.md`, §5, lot T3).
 *
 * Les seuils viennent de `GET …/batch/:date/due-thresholds`, déjà rangés
 * selon le mode réglé : la fiche ne les recalcule pas. Une lecture qui échoue
 * ne retire rien à la fiche — les quantités restent justes — mais l'écran le
 * dit (`failed`).
 *
 * Fourni par l'écran, comme {@link WorkshopDayReader}. Une réponse lente
 * n'écrase jamais une plus récente.
 */
@Injectable()
export class WorkshopTranchesReader {
  private readonly api = inject(ProductionService);

  private readonly view = signal<ProductionDueThresholdsView | null>(null);
  private readonly readFailed = signal(false);
  readonly failed = this.readFailed.asReadonly();

  private date: string | null = null;
  private readSeq = 0;

  /** Les seuils servis, par SKU. */
  readonly bySku = computed<ReadonlyMap<string, readonly DueThresholdView[]>>(
    () => new Map((this.view()?.lines ?? []).map((line) => [line.sku, line.thresholds])),
  );

  /** Lit la journée donnée ; `null` vide la lecture. */
  async load(date: string | null): Promise<void> {
    this.date = date;
    if (date === null) {
      this.view.set(null);
      return;
    }
    await this.read(date);
  }

  /** Relit la journée déjà lue — quand le plan a bougé. */
  async reload(): Promise<void> {
    if (this.date !== null) {
      await this.read(this.date);
    }
  }

  private async read(date: string): Promise<void> {
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.api.dueThresholds(date);
      if (seq === this.readSeq) {
        this.view.set(served);
        this.readFailed.set(false);
      }
    } catch {
      if (seq === this.readSeq) {
        this.readFailed.set(true);
      }
    }
  }
}
