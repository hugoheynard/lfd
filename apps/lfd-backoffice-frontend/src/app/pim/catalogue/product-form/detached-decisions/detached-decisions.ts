import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';
import { PermissionsStore } from '../../../../auth/permissions.store';
import {
  carryOverPermission,
  DecisionCarryOver,
  defaultCarryOverReason,
} from '../decision-carry-over/decision-carry-over';
import { ProductFormStore } from '../product-form-store';
import {
  decisionKindLabel,
  detachedDecisionLines,
  linesToCarryAll,
} from './detached-decisions-lines';

type LoadState = 'idle' | 'ready' | 'error';

/**
 * **Les décisions tarifaires restées sur l’ancienne référence**
 * (`plan-pro-voit-les-declinaisons.md`, L7 d) — sur une fiche née d’un
 * détachement.
 *
 * Le tarif est à plat : une mercuriale, une règle, un plancher posés sur
 * l’ancienne référence ne valent que pour elle, et le détachement ne les
 * déplace pas (D2 de `plan-gestes-de-declinaison.md`). L’écran les liste, et
 * chacune se reporte sur la nouvelle référence : une mercuriale par un avenant
 * daté (`plan-tarif-date-sur-une-reference.md`, § 6), les autres familles par
 * une décision neuve, le gabarit en remplaçant sa ligne
 * (`plan-report-apres-detachement.md`, § 5). « Tout reporter » ne reporte que
 * ce que le rôle de la personne permet de poser (Hugo, 2026-10-30).
 *
 * La nouvelle référence est le défaut de cette fiche : la déclinaison
 * détachée en est devenue le défaut. Une mercuriale déjà reportée se lit
 * aussi sur elle — sa ligne le dit au lieu de proposer un second report,
 * que le serveur refuserait. Une décision reportée se reconnaît à son
 * origine.
 *
 * L’ancienne référence vient de la filiation du référentiel
 * (`lineage.origin.variantSku`) : la fiche née inactive n’a pas encore
 * d’article au commerce, et la liste doit se lire avant qu’elle se vende.
 */
@Component({
  selector: 'app-detached-decisions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    DecisionCarryOver,
  ],
  templateUrl: './detached-decisions.html',
  styleUrl: './detached-decisions.scss',
})
export class DetachedDecisions {
  protected readonly store = inject(ProductFormStore);
  private readonly decisions = inject(SaleReferenceDecisionsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<LoadState>('idle');
  private readonly views = signal<readonly SaleReferenceDecisionView[]>([]);
  /** Les décisions déjà debout sur la NOUVELLE référence — un report fait s'y lit. */
  private readonly onNewSku = signal<readonly SaleReferenceDecisionView[]>([]);

  protected readonly originSku = computed(() => this.store.lineage().origin?.variantSku ?? null);
  protected readonly newSku = computed(
    () => this.store.variantTabs().find((variant) => variant.isDefault)?.sku ?? null,
  );
  protected readonly lines = computed(() =>
    detachedDecisionLines(this.views(), this.onNewSku(), this.originSku() ?? ''),
  );
  /** Ce que « Tout reporter » reporterait : à faire, et permis à cette personne. */
  protected readonly carryAll = computed(() =>
    linesToCarryAll(this.lines(), (kind) => this.permissions.can(carryOverPermission(kind))),
  );
  protected readonly carryAllOpen = signal(false);
  protected readonly carryingAll = signal(false);
  protected readonly carryAllRefusals = signal<readonly string[]>([]);
  protected readonly reasonFor = defaultCarryOverReason;

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

  /**
   * **Tout reporter**, une décision après l’autre : chaque report passe par la
   * route de SA famille, sous SA garde. Un refus n’arrête pas les suivants ; il
   * reste à l’écran, nommé, et la liste relue montre ce qui est fait.
   */
  protected async carryEverything(fromSku: string, toSku: string): Promise<void> {
    this.carryingAll.set(true);
    const refusals: string[] = [];
    for (const line of this.carryAll()) {
      try {
        await this.decisions.carryOverDecision(line.kind, line.id, {
          fromSku,
          toSku,
          reason: defaultCarryOverReason(fromSku),
        });
      } catch (caught) {
        refusals.push(
          `${decisionKindLabel(line.kind)} ${line.id} : ${httpErrorMessage(caught, "le report n'a pas abouti.")}`,
        );
      }
    }
    this.carryAllRefusals.set(refusals);
    this.carryingAll.set(false);
    this.carryAllOpen.set(false);
    this.reload();
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
