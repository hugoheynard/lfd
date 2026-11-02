import type {
  ResupplyArticleView,
  ResupplyTarget,
  SiteResuppliesView,
  SiteStockAlertsView,
  StockAlertLevel,
  StockAlertView,
} from '@lfd/contracts';

import { parisToday } from '../../shared/paris-today';

/**
 * Les doublures du réassort d'un point, partagées par les specs de la table,
 * de sa case de quantité et du reçu sans commande : une demande en mémoire qui
 * prend une version par geste comme le serveur, des alertes et des reçus qui
 * consignent les appels.
 */
export const TODAY = parisToday();
export const ARTICLES: readonly ResupplyArticleView[] = [
  {
    sku: 'BAG',
    name: 'Baguette',
    categoryId: 'fam_bread',
    categoryName: 'Pains',
    saleUnit: 'piece' as const,
  },
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
    saleUnit: 'piece' as const,
  },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
    saleUnit: 'piece',
  },
];

/** La demande en cours, en mémoire : une version par geste, comme le serveur. */
export class FakeResupplies {
  readonly calls: string[] = [];
  private readonly lines = new Map<ResupplyTarget, Map<string, number>>([
    ['asap', new Map()],
    ['tomorrow', new Map()],
  ]);
  private version = 0;
  private readonly names = new Map<ResupplyTarget, string>();
  tomorrowOrderUntil: string | null = null;
  usedNames: readonly string[] = [];

  list(siteId: string): Promise<SiteResuppliesView> {
    const drafts = (['asap', 'tomorrow'] as const).flatMap((target) => {
      const lines = [...(this.lines.get(target) ?? new Map<string, number>())];
      const name = this.names.get(target) ?? null;
      return lines.length === 0 && name === null
        ? []
        : [
            {
              id: `draft_${target}`,
              target,
              serviceDay: TODAY,
              version: this.version,
              name,
              lines: lines.map(([sku, quantity]) => ({
                sku,
                label: sku,
                quantity,
                saleUnit: 'piece' as const,
              })),
            },
          ];
    });
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TODAY,
      tomorrowOrderUntil: this.tomorrowOrderUntil,
      drafts,
      resupplies: [],
      usedNames: this.usedNames,
    });
  }
  name(_s: string, target: ResupplyTarget, name: string | null): Promise<{ id: string }> {
    this.calls.push(`name ${target} ${name ?? ''}`);
    const trimmed = (name ?? '').trim();
    if (trimmed === '') {
      this.names.delete(target);
    } else {
      this.names.set(target, trimmed);
    }
    this.version += 1;
    return Promise.resolve({ id: `draft_${target}` });
  }
  addLine(
    _s: string,
    target: ResupplyTarget,
    sku: string,
    quantity: number,
  ): Promise<{ id: string }> {
    this.calls.push(`add ${target} ${sku} ${String(quantity)}`);
    const lines = this.lines.get(target);
    lines?.set(sku, (lines.get(sku) ?? 0) + quantity);
    this.version += 1;
    return Promise.resolve({ id: `draft_${target}` });
  }
  correctLine(_s: string, id: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${id} ${sku} ${String(quantity)}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.set(sku, quantity);
    this.version += 1;
    return Promise.resolve();
  }
  withdrawLine(_s: string, id: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${id} ${sku}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.delete(sku);
    this.version += 1;
    return Promise.resolve();
  }
  send(_s: string, id: string): Promise<void> {
    this.calls.push(`send ${id}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.clear();
    this.version += 1;
    return Promise.resolve();
  }
}

export class FakeAlerts {
  readonly calls: string[] = [];
  /** Les lectures, à part des gestes : la page vérifie qu'elle relit. */
  readonly listed: string[] = [];
  alerts: StockAlertView[] = [];

  list(siteId: string): Promise<SiteStockAlertsView> {
    this.listed.push(siteId);
    return Promise.resolve({ siteId, alerts: this.alerts });
  }
  declare(siteId: string, sku: string, level: StockAlertLevel): Promise<void> {
    this.calls.push(`declare ${sku} ${level}`);
    this.alerts = [
      {
        id: `alert_${sku}`,
        siteId,
        sku,
        label: sku,
        level,
        declaredAt: '2026-01-02T08:30:00.000Z',
        declaredBy: 'Lou',
      },
      ...this.alerts.filter((a) => a.sku !== sku),
    ];
    return Promise.resolve();
  }
  lift(_siteId: string, alertId: string): Promise<void> {
    this.calls.push(`lift ${alertId}`);
    this.alerts = this.alerts.filter((a) => a.id !== alertId);
    return Promise.resolve();
  }
}

export class FakeReceipts {
  readonly calls: string[] = [];
  receive(_s: string, _d: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${sku} ${String(quantity)}`);
    return Promise.resolve();
  }
  correct(_s: string, _d: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${sku} ${String(quantity)}`);
    return Promise.resolve();
  }
  withdraw(_s: string, _d: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${sku}`);
    return Promise.resolve();
  }
}
