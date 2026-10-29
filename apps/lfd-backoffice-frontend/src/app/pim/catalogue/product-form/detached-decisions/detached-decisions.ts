import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';
import { MercurialeCarryOver } from '../mercuriale-carry-over/mercuriale-carry-over';
import { ProductFormStore } from '../product-form-store';
import { detachedDecisionLines } from './detached-decisions-lines';

type LoadState = 'idle' | 'ready' | 'error';

/**
 * **Les décisions tarifaires restées sur l’ancienne référence**
 * (`plan-pro-voit-les-declinaisons.md`, L7 d) — sur une fiche née d’un
 * détachement.
 *
 * Le tarif est à plat : une mercuriale, une règle, un plancher posés sur
 * l’ancienne référence ne valent que pour elle, et le détachement ne les
 * déplace pas (D2 de `plan-gestes-de-declinaison.md`). L’écran les liste ;
 * une MERCURIALE se reporte sur la nouvelle référence par un avenant daté
 * (`plan-tarif-date-sur-une-reference.md`, § 6). Les autres familles gardent
 * leur geste propre, sur leur écran.
 *
 * La nouvelle référence est le défaut de cette fiche : la déclinaison
 * détachée en est devenue le défaut. Une mercuriale déjà reportée se lit
 * aussi sur elle — sa ligne le dit au lieu de proposer un second report,
 * que le serveur refuserait.
 *
 * L’ancienne référence vient de la filiation du référentiel
 * (`lineage.origin.variantSku`) : la fiche née inactive n’a pas encore
 * d’article au commerce, et la liste doit se lire avant qu’elle se vende.
 */
@Component({
  selector: 'app-detached-decisions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, MercurialeCarryOver],
  templateUrl: './detached-decisions.html',
  styleUrl: './detached-decisions.scss',
})
export class DetachedDecisions {
  protected readonly store = inject(ProductFormStore);
  private readonly decisions = inject(SaleReferenceDecisionsService);

  protected readonly state = signal<LoadState>('idle');
  private readonly views = signal<readonly SaleReferenceDecisionView[]>([]);
  /** Les décisions déjà debout sur la NOUVELLE référence — un report fait s'y lit. */
  private readonly onNewSku = signal<readonly SaleReferenceDecisionView[]>([]);

  protected readonly originSku = computed(() => this.store.lineage().origin?.variantSku ?? null);
  protected readonly newSku = computed(
    () => this.store.variantTabs().find((variant) => variant.isDefault)?.sku ?? null,
  );
  protected readonly lines = computed(() => detachedDecisionLines(this.views(), this.onNewSku()));

  constructor() {
    effect(() => {
      const sku = this.originSku();
      const newSku = this.newSku();
      if (sku !== null) {
        void this.load(sku, newSku);
      }
    });
  }

  /** Après un report : relire les deux listes. */
  protected reload(): void {
    const sku = this.originSku();
    if (sku !== null) {
      void this.load(sku, this.newSku());
    }
  }

  private async load(sku: string, newSku: string | null): Promise<void> {
    try {
      const [views, onNewSku] = await Promise.all([
        this.decisions.standingOn(sku),
        newSku === null ? Promise.resolve([]) : this.decisions.standingOn(newSku),
      ]);
      this.views.set(views);
      this.onNewSku.set(onNewSku);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
