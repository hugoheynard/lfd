import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpErrorCode } from '@lfd/endpoints';
import type { EffectiveOrderTimeLimitView, EffectiveRuleView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { LimitPanel } from '../../../../order-time-limits/limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { ProductFormStore } from '../../product-form-store';
import { effectivePhrase, familyName, familyRules, productRule } from './order-limit-row';

/** Une limite de famille en jeu, prête à afficher avec sa case. */
interface FamilyRow {
  readonly entry: EffectiveRuleView;
  readonly name: string;
}

/**
 * **Limite de commande** — jusqu'à quand on prend commande de ce produit.
 *
 * Plusieurs limites peuvent le viser : la sienne, et celles des familles de sa
 * lignée qui ne l'excluent pas. La plus stricte gagne. La carte lit la route
 * `effective`, qui fait la même résolution que le commerce : elle dit la
 * limite effective et sa provenance, liste les familles qui posent une limite
 * avec une case « Exclure », et garde la pose de la limite propre du produit.
 *
 * ## Elle ne participe PAS à l'enregistrement de la fiche
 *
 * La limite vit dans un autre contexte, avec ses propres routes. Le panneau et
 * les cases écrivent seuls — rien à accrocher au garde « modifications non
 * enregistrées ».
 */
@Component({
  selector: 'app-order-limit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldCheckboxComponent, RouterLink],
  templateUrl: './order-limit-form.html',
  styleUrls: ['../form-section.scss', './order-limit-form.scss'],
})
export class OrderLimitForm {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  private readonly view = signal<EffectiveOrderTimeLimitView | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly pendingRemoval = signal(false);

  /** La limite propre du produit, en vigueur, ou `null`. */
  protected readonly rule = computed(() =>
    productRule(
      (this.view()?.rules ?? []).map((entry) => entry.rule).filter((rule) => !rule.archived),
      this.store.productId(),
    ),
  );

  /** La limite effective et sa provenance — ou `null` : seule la règle générale juge. */
  protected readonly phrase = computed(() => {
    const view = this.view();
    return view === null ? null : effectivePhrase(view);
  });

  /** La case de la limite effective : vraie seulement si toutes celles qui le visent la cochent. */
  protected readonly mayExceed = computed(
    () => this.view()?.explained?.limit.staffMayExceed ?? false,
  );

  protected readonly families = computed<readonly FamilyRow[]>(() => {
    const view = this.view();
    if (view === null) {
      return [];
    }
    return familyRules(view).map((entry) => ({ entry, name: familyName(view, entry.rule) }));
  });

  constructor() {
    // Rechargé quand la fiche change d'identité : rester sur les règles de la
    // précédente ferait modifier un article en croyant en modifier un autre.
    effect(() => {
      if (this.store.productId() !== '') {
        untracked(() => void this.load());
      }
    });
  }

  protected async load(): Promise<void> {
    try {
      this.view.set(await this.api.effective(this.store.productId()));
      this.failed.set(false);
    } catch {
      // « Aucune limite » et « on n'a pas pu lire » ne se ressemblent que sur
      // un écran mal fait.
      this.failed.set(true);
    }
  }

  protected edit(): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: {
        scope: { type: 'product', id: this.store.productId() },
        label: this.store.pageTitle(),
        rule: this.rule(),
      },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected askRemove(): void {
    this.pendingRemoval.set(true);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(false);
  }

  protected async remove(): Promise<void> {
    const rule = this.rule();
    this.pendingRemoval.set(false);
    if (rule === null) {
      return;
    }
    try {
      await this.api.archive(rule.id);
      this.notify.success(
        "Limite archivée — elle ne s'applique plus ; restent celles de ses familles et la règle générale.",
      );
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  /** Coche : exclut le produit de la limite de la famille ; décoche : l'y réintègre. */
  protected async setExcluded(row: FamilyRow, excluded: boolean): Promise<void> {
    const productId = this.store.productId();
    this.busy.set(true);
    try {
      if (excluded) {
        await this.api.exclude(row.entry.rule.id, productId);
        this.notify.success(`Exclu de la limite de la famille ${row.name}.`);
      } else {
        await this.api.include(row.entry.rule.id, productId);
        this.notify.success(`De nouveau soumis à la limite de la famille ${row.name}.`);
      }
    } catch (error) {
      if (httpErrorCode(error) === 'pim.order_time_limit.exclusion_outside_family') {
        // Le refus nommé par la famille de la ligne : le serveur ne la connaît
        // que par son identifiant.
        this.notify.refused(undefined, `Ce produit n'est pas dans la famille ${row.name}.`);
      } else {
        this.notify.error(error);
      }
    } finally {
      this.busy.set(false);
    }
    // Relue dans tous les cas : un refus remet la case où le serveur la tient.
    await this.load();
  }
}
