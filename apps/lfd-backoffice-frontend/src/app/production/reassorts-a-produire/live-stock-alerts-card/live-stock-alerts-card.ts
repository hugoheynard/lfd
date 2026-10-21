import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { LiveStockAlertsView, StockAlertLevel, StockAlertView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { SiteResuppliesService } from '../../../comptoir/reassort-boutique-page/site-resupplies.service';

const LEVEL_WORDS: Readonly<Record<StockAlertLevel, string>> = {
  out_of_stock: 'rupture',
  low: 'stock faible',
};

/** Une alerte, avec le point qui l'a déclarée. */
interface SiteAlert {
  readonly siteId: string;
  readonly siteLabel: string;
  readonly alert: StockAlertView;
}

/**
 * **Les alertes des points** — en tête de « Réassorts à produire » (lot R1b,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21) :
 * « Village : rupture — Croissant ». « Lancer un réassort au plus tôt » passe
 * un réassort `asap` de cet article pour ce point, par la route du comptoir.
 * Depuis R1c, la route l'AJOUTE à la demande « au plus tôt » en cours du
 * point, puis envoie cette demande entière — ce que le comptoir y avait mis
 * part avec : un seul réassort « au plus tôt » à la fois. Le bouton
 * n'apparaît qu'à qui tient `handover_counter:write`, le droit
 * de cette route (aucun droit du fournil ne la couvre, vérifié le 2026-10-21).
 */
@Component({
  selector: 'app-live-stock-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './live-stock-alerts-card.html',
  styleUrl: './live-stock-alerts-card.scss',
})
export class LiveStockAlertsCard {
  private readonly resupplies = inject(SiteResuppliesService);
  private readonly permissions = inject(PermissionsStore);

  readonly view = input.required<LiveStockAlertsView>();
  /** Un réassort vient d'être passé : la page relit. */
  readonly placed = output();

  protected readonly canPlace = computed(() => this.permissions.can('handover_counter:write'));
  protected readonly alerts = computed<readonly SiteAlert[]>(() =>
    this.view().sites.flatMap((site) =>
      site.alerts.map((alert) => ({
        siteId: site.siteId,
        siteLabel: site.siteLabel ?? 'Point inconnu',
        alert,
      })),
    ),
  );
  /** L'alerte dont on saisit la quantité ; une seule à la fois. */
  protected readonly opened = signal<string | null>(null);
  protected readonly quantity = signal<number | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected sentence(entry: SiteAlert): string {
    return `${entry.siteLabel} : ${LEVEL_WORDS[entry.alert.level]} — ${entry.alert.label}`;
  }

  protected open(entry: SiteAlert): void {
    this.opened.set(entry.alert.id);
    this.quantity.set(null);
    this.failure.set(null);
  }

  protected close(): void {
    this.opened.set(null);
  }

  /** Ajoute l'article à la demande « au plus tôt » du point, et l'envoie (R1c). */
  protected async launch(entry: SiteAlert): Promise<void> {
    const quantity = this.quantity();
    if (quantity === null || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.resupplies.place(entry.siteId, {
        target: 'asap',
        lines: [{ sku: entry.alert.sku, quantity }],
      });
      this.opened.set(null);
      this.placed.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être passé."));
    } finally {
      this.pending.set(false);
    }
  }
}
