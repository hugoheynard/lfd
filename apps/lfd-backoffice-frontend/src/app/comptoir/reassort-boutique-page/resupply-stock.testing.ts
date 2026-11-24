import type {
  AppliedResupplyTemplateResponse,
  ApplyResupplyTemplatePayload,
  ResupplyArticleView,
  ResupplyTarget,
  SiteResuppliesView,
  SiteStockAlertsView,
  SkippedResupplyTemplateLine,
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
    family: { id: 'fam_bread', name: 'Pains', position: 0 },
    saleUnit: 'piece' as const,
  },
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
    family: { id: 'fam_morning', name: 'Viennoiseries', position: 0 },
    saleUnit: 'piece' as const,
  },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
    family: { id: 'fam_morning', name: 'Viennoiseries', position: 0 },
    saleUnit: 'piece',
  },
];

/** La demande en cours, en mémoire : une version par geste, comme le serveur. */
export class FakeResupplies {
  readonly calls: string[] = [];
  /** La clé d'intention de chaque ajout, dans l'ordre. */
  readonly addKeys: string[] = [];
  private readonly lines = new Map<ResupplyTarget, Map<string, number>>([
    ['asap', new Map()],
    ['tomorrow', new Map()],
  ]);
  private version = 0;
  private readonly names = new Map<ResupplyTarget, string>();
  tomorrowOrderUntil: string | null = null;
  /** Réglages › Comptoir : le point suit-il son stock ? Suivi par défaut dans les doublures. */
  stockTracking = true;
  usedNames: readonly string[] = [];
  /** L'heure que le point demande pour demain (H-D3) ; `null` : incalculable. */
  suggestedArrivalBy: string | null = '06:30';
  /** L'heure déjà posée sur chaque demande (par un modèle appliqué). */
  readonly arrivals = new Map<ResupplyTarget, string>();

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
              arrivalBy: this.arrivals.get(target) ?? null,
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
      suggestedArrivalBy: this.suggestedArrivalBy,
      drafts,
      resupplies: [],
      usedNames: this.usedNames,
      stockTracking: this.stockTracking,
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
    intentKey: string,
  ): Promise<{ id: string }> {
    this.calls.push(`add ${target} ${sku} ${String(quantity)}`);
    this.addKeys.push(intentKey);
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
  /** La clé d'intention de chaque application de modèle, dans l'ordre. */
  readonly applyKeys: string[] = [];
  /** Les refus des prochaines applications, dans l'ordre ; vide : elles passent. */
  applyFailures: unknown[] = [];
  /** Ce que le modèle appliqué pose, et ce que le serveur écarte. */
  templateLines = new Map<string, number>([['CRO', 12]]);
  skipped: SkippedResupplyTemplateLine[] = [];
  applyTemplate(
    _s: string,
    target: ResupplyTarget,
    payload: ApplyResupplyTemplatePayload,
    intentKey: string,
  ): Promise<AppliedResupplyTemplateResponse> {
    this.calls.push(`apply ${target} ${payload.templateId} ${payload.mode}`);
    this.applyKeys.push(intentKey);
    const failure = this.applyFailures.shift();
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    const lines = this.lines.get(target);
    if (payload.mode === 'replace') {
      lines?.clear();
    }
    for (const [sku, quantity] of this.templateLines) {
      lines?.set(sku, (lines.get(sku) ?? 0) + quantity);
    }
    this.version += 1;
    return Promise.resolve({ resupplyId: `draft_${target}`, skipped: this.skipped });
  }
  send(_s: string, id: string, _version: number, arrivalBy?: string): Promise<void> {
    this.calls.push(arrivalBy === undefined ? `send ${id}` : `send ${id} ${arrivalBy}`);
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
