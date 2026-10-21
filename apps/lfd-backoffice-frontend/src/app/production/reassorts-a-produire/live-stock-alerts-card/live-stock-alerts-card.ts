import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LiveStockAlertsView, StockAlertLevel, StockAlertView } from '@lfd/contracts';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

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
 * « Village : rupture — Croissant ». POUR INFORMATION depuis le lot R1d
 * (Hugo, 2026-10-21) : le bouton « Lancer un réassort au plus tôt », qui
 * envoyait la demande « au plus tôt » DU COMPTOIR avec ce que le comptoir y
 * avait mis, est retiré. Le fournil qui veut répondre envoie son propre
 * réassort (« Envoyer un réassort »).
 */
@Component({
  selector: 'app-live-stock-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './live-stock-alerts-card.html',
  styleUrl: './live-stock-alerts-card.scss',
})
export class LiveStockAlertsCard {
  readonly view = input.required<LiveStockAlertsView>();

  protected readonly alerts = computed<readonly SiteAlert[]>(() =>
    this.view().sites.flatMap((site) =>
      site.alerts.map((alert) => ({
        siteId: site.siteId,
        siteLabel: site.siteLabel ?? 'Point inconnu',
        alert,
      })),
    ),
  );

  protected sentence(entry: SiteAlert): string {
    return `${entry.siteLabel} : ${LEVEL_WORDS[entry.alert.level]} — ${entry.alert.label}`;
  }
}
