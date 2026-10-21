import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyReceiptView,
  ResupplyReceptionView,
  SiteResuppliesView,
  SiteStockAlertsView,
  StaffPermission,
  StockAlertLevel,
  StockAlertView,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { CounterPlace } from '../../handover-shop/handover-queue';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { parisToday } from '../../shared/paris-today';
import { ReassortBoutiquePage } from './reassort-boutique-page';
import { ResupplyReceiptsService } from './resupply-receipts.service';
import { ResupplyReceptionsCard } from './resupply-receptions-card/resupply-receptions-card';
import { AsapDraftAdder } from './asap-draft-adder/asap-draft-adder';
import { SiteResuppliesService } from './site-resupplies.service';
import { SiteStockAlertsService } from './site-stock-alerts.service';
import { StockAlertsCard } from './stock-alerts-card/stock-alerts-card';
import { UnorderedReceiptCard } from './unordered-receipt-card/unordered-receipt-card';

/**
 * Le réassort boutique (J1, refait au lot R2 le 2026-10-21) : un point de
 * retrait, une journée, un reçu par réassort réceptionné d'un geste, le
 * réassort sans commande, et le stock estimé, somme des reçus — aucune
 * colonne « commandé ».
 */
const TODAY = parisToday();
const VILLAGE: CounterPlace = { id: 'site_v', label: 'Village' };
const LABO: CounterPlace = { id: 'site_l', label: 'Labo' };

/** La bande du comptoir, doublée : le point ouvert et la lecture des sites. */
function counter(initial: CounterPlace | null = VILLAGE) {
  return {
    activePlace: signal<CounterPlace | null>(initial),
    placesLoaded: signal(true),
    day: signal(TODAY),
  };
}

const ARTICLES: readonly ResupplyArticleView[] = [
  { sku: 'CRO', name: 'Croissant' },
  { sku: 'PAC', name: 'Pain au chocolat' },
];

/**
 * Un serveur en mémoire : les gestes changent ce que la lecture rend. Le
 * stock est la somme des reçus, comme côté serveur (lot R2).
 */
class FakeReceipts {
  readonly calls: string[] = [];
  unordered: UnorderedReceiptLineView[] = [];
  receptions: ResupplyReceptionView[] = [];
  failRead = false;

  articles(): Promise<readonly ResupplyArticleView[]> {
    return Promise.resolve(ARTICLES);
  }
  read(siteId: string, day: string): Promise<ResupplyReceiptView> {
    this.calls.push(`read ${siteId} ${day}`);
    if (this.failRead) {
      return Promise.reject(new Error('hors ligne'));
    }
    return Promise.resolve({
      siteId,
      serviceDay: day,
      receptions: this.receptions,
      unordered: { lines: this.unordered, updatedAt: null, updatedBy: null },
      stock: this.stock(),
    });
  }
  receiveResupply(_site: string, resupplyId: string): Promise<void> {
    this.calls.push(`receive-resupply ${resupplyId}`);
    this.receptions = this.receptions.map((r) =>
      r.resupplyId === resupplyId
        ? {
            ...r,
            status: 'received',
            receivedAt: '2026-01-02T08:30:00.000Z',
            receivedBy: 'Lou',
            lines: r.lines.map((l) => ({ ...l, receivedQuantity: l.expectedQuantity })),
          }
        : r,
    );
    return Promise.resolve();
  }
  correctReceived(_site: string, resupplyId: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct-received ${resupplyId} ${sku} ${String(quantity)}`);
    this.receptions = this.receptions.map((r) =>
      r.resupplyId === resupplyId
        ? {
            ...r,
            lines: r.lines.map((l) => (l.sku === sku ? { ...l, receivedQuantity: quantity } : l)),
          }
        : r,
    );
    return Promise.resolve();
  }
  receive(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${sku} ${String(quantity)}`);
    const label = ARTICLES.find((a) => a.sku === sku)?.name ?? sku;
    this.unordered = [...this.unordered, { sku, label, receivedQuantity: quantity }];
    return Promise.resolve();
  }
  correct(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${sku} ${String(quantity)}`);
    this.unordered = this.unordered.map((l) =>
      l.sku === sku ? { ...l, receivedQuantity: quantity } : l,
    );
    return Promise.resolve();
  }
  withdraw(_site: string, _day: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${sku}`);
    this.unordered = this.unordered.filter((l) => l.sku !== sku);
    return Promise.resolve();
  }

  private stock(): ResupplyReceiptLineView[] {
    const totals = new Map<string, ResupplyReceiptLineView>();
    const received = [
      ...this.receptions.flatMap((r) =>
        r.lines.flatMap((l) =>
          l.receivedQuantity === null ? [] : [{ ...l, receivedQuantity: l.receivedQuantity }],
        ),
      ),
      ...this.unordered,
    ];
    for (const line of received) {
      const sum = (totals.get(line.sku)?.receivedQuantity ?? 0) + line.receivedQuantity;
      totals.set(line.sku, {
        sku: line.sku,
        label: line.label,
        receivedQuantity: sum,
        estimatedStock: sum,
      });
    }
    return [...totals.values()];
  }
}

/** Un réassort envoyé, attendu. */
function expected(resupplyId: string, quantity: number): ResupplyReceptionView {
  return {
    resupplyId,
    target: 'asap',
    origin: 'counter',
    placedAt: '2026-01-02T07:00:00.000Z',
    placedBy: 'Max',
    status: 'expected',
    receivedAt: null,
    receivedBy: null,
    lines: [{ sku: 'CRO', label: 'Croissant', expectedQuantity: quantity, receivedQuantity: null }],
  };
}

/**
 * La commande au fournil (R1, R1c) a sa propre suite : ici, une demande en
 * cours qui retient ce qu'on y ajoute, pour la proposition des alertes.
 */
class FakeResupplies {
  readonly added: string[] = [];

  list(siteId: string): Promise<SiteResuppliesView> {
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TODAY,
      tomorrowOrderUntil: null,
      drafts:
        this.added.length === 0
          ? []
          : [
              {
                id: 'draft_asap',
                target: 'asap',
                serviceDay: TODAY,
                version: this.added.length,
                lines: this.added.map((sku) => ({ sku, label: sku, quantity: 1 })),
              },
            ],
      resupplies: [],
    });
  }

  addLine(siteId: string, target: string, sku: string, quantity: number): Promise<{ id: string }> {
    this.added.push(sku);
    this.calls.push(`add ${siteId} ${target} ${sku} ${String(quantity)}`);
    return Promise.resolve({ id: 'draft_asap' });
  }

  readonly calls: string[] = [];
}

/**
 * Les alertes de stock (R1b) en mémoire : déclarer redéclare la vivante,
 * lever la retire, et une réception de l'article la lève comme le serveur.
 */
class FakeAlerts {
  readonly calls: string[] = [];
  alerts: StockAlertView[] = [];

  list(siteId: string): Promise<SiteStockAlertsView> {
    this.calls.push(`list ${siteId}`);
    return Promise.resolve({ siteId, alerts: this.alerts });
  }
  declare(siteId: string, sku: string, level: StockAlertLevel): Promise<void> {
    this.calls.push(`declare ${sku} ${level}`);
    const label = ARTICLES.find((a) => a.sku === sku)?.name ?? sku;
    this.alerts = [
      {
        id: `alert_${sku}`,
        siteId,
        sku,
        label,
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

/** Le chargement enchaîne deux lectures : on laisse passer les tâches en attente. */
async function settle(fixture: ComponentFixture<ReassortBoutiquePage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(
  permissions: readonly StaffPermission[],
  api = new FakeReceipts(),
  band = counter(),
  alerts = new FakeAlerts(),
  resupplies = new FakeResupplies(),
): Promise<{
  fixture: ComponentFixture<ReassortBoutiquePage>;
  api: FakeReceipts;
  band: ReturnType<typeof counter>;
  alerts: FakeAlerts;
  resupplies: FakeResupplies;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReassortBoutiquePage],
    providers: [
      { provide: ResupplyReceiptsService, useValue: api },
      { provide: SiteResuppliesService, useValue: resupplies },
      { provide: SiteStockAlertsService, useValue: alerts },
      { provide: HandoverQueueStore, useValue: band },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReassortBoutiquePage);
  await settle(fixture);
  return { fixture, api, band, alerts, resupplies };
}

const root = (fixture: ComponentFixture<ReassortBoutiquePage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function unorderedCard(fixture: ComponentFixture<ReassortBoutiquePage>): UnorderedReceiptCard {
  const card: unknown = fixture.debugElement.query(
    By.css('app-unordered-receipt-card'),
  ).componentInstance;
  if (!(card instanceof UnorderedReceiptCard)) {
    throw new Error('la carte du réassort sans commande manque');
  }
  return card;
}

function clickOn(fixture: ComponentFixture<ReassortBoutiquePage>, selector: string): void {
  const button = root(fixture).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`bouton absent : ${selector}`);
  }
  button.click();
}

describe('ReassortBoutiquePage', () => {
  it('lit le point ouvert dans la bande pour aujourd’hui, et dit le vide', async () => {
    const { fixture, api } = await mount(['handover_counter:read']);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`]);
    expect(root(fixture).textContent).toContain('Rien de reçu pour cette journée');
    expect(root(fixture).querySelector('[data-resupply-add]')).toBeNull();
  });

  it('montre le stock estimé du jour, somme des reçus, sans colonne « commandé »', async () => {
    const api = new FakeReceipts();
    api.unordered = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 2 }];
    api.receptions = [{ ...expected('r1', 12) }];
    await api.receiveResupply('site_v', 'r1');
    const { fixture } = await mount(['handover_counter:read'], api);

    const row = root(fixture).querySelector('[data-resupply-stock] [data-resupply-line="CRO"]');
    expect(row?.textContent).toContain('Croissant');
    expect(row?.querySelector('[data-resupply-estimated]')?.textContent?.trim()).toBe('14');
    expect(root(fixture).querySelector('thead')?.textContent).not.toContain('ommandé');
    expect(root(fixture).textContent).toContain('le stock estimé est le reçu');
  });

  it('réceptionne un réassort d’un geste, puis dit qui et quand, et corrige un écart', async () => {
    const api = new FakeReceipts();
    api.receptions = [expected('r1', 12)];
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write'], api);
    const reception = '[data-resupply-reception="r1"]';

    expect(root(fixture).querySelector(`${reception} [data-resupply-correct-received]`)).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-stock] [data-resupply-line]')).toBeNull();
    clickOn(fixture, `${reception} [data-resupply-receive]`);
    await settle(fixture);

    expect(root(fixture).querySelector(`${reception} [data-resupply-receive]`)).toBeNull();
    expect(
      root(fixture).querySelector(`${reception} [data-resupply-received-by]`)?.textContent,
    ).toContain('Réceptionné par Lou à');
    expect(
      root(fixture).querySelector('[data-resupply-line="CRO"] [data-resupply-estimated]')
        ?.textContent,
    ).toContain('12');

    const card: unknown = fixture.debugElement.query(
      By.css('app-resupply-receptions-card'),
    ).componentInstance;
    const view = api.receptions[0];
    const line = view?.lines[0];
    if (!(card instanceof ResupplyReceptionsCard) || view === undefined || line === undefined) {
      throw new Error('la carte de réception manque');
    }
    card['setDraft'](view, line, 10);
    await settle(fixture);
    clickOn(fixture, `${reception} [data-resupply-correct-received]`);
    await settle(fixture);

    expect(api.calls.filter((c) => !c.startsWith('read'))).toEqual([
      'receive-resupply r1',
      'correct-received r1 CRO 10',
    ]);
    expect(
      root(fixture).querySelector('[data-resupply-line="CRO"] [data-resupply-estimated]')
        ?.textContent,
    ).toContain('10');
  });

  it('en lecture seule, ni « Réceptionner » ni saisie sans commande', async () => {
    const api = new FakeReceipts();
    api.receptions = [expected('r1', 12)];
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('[data-resupply-receive]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-add]')).toBeNull();
  });

  it('suit le point de la bande : un changement relit la liste, et le titre le nomme', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);
    const title = (): string => fixture.componentInstance['title']();

    expect(title()).toBe('Réassort Village');
    expect(root(fixture).querySelector('fold-listbox')).toBeNull();

    band.activePlace.set(LABO);
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`, `read site_l ${parisToday()}`]);
    expect(title()).toBe('Réassort Labo');
    expect(root(fixture).textContent).toContain('Réassort Labo');
  });

  it('suit la journée de la bande : ses flèches relisent la liste', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);

    band.day.set('2026-01-03');
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${TODAY}`, 'read site_v 2026-01-03']);
    expect(root(fixture).querySelector('input[type="date"]')).toBeNull();
  });

  it('sans point ouvert, s’appelle « Réassort » et invite à en choisir un dans le bandeau', async () => {
    const { fixture, api } = await mount(
      ['handover_counter:read'],
      new FakeReceipts(),
      counter(null),
    );

    expect(fixture.componentInstance['title']()).toBe('Réassort');
    expect(api.calls).toEqual([]);
    expect(root(fixture).querySelector('[data-resupply-no-place]')?.textContent).toContain(
      'bandeau du comptoir',
    );
  });

  it('dit l’échec de chargement par un état fold', async () => {
    const api = new FakeReceipts();
    api.failRead = true;
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de charger le réassort',
    );
  });
});

describe('ReassortBoutiquePage — ruptures et stocks faibles (R1b)', () => {
  const WRITE: readonly StaffPermission[] = ['handover_counter:read', 'handover_counter:write'];

  function click(fixture: ComponentFixture<ReassortBoutiquePage>, selector: string): void {
    const button = root(fixture).querySelector<HTMLButtonElement>(selector);
    if (button === null) {
      throw new Error(`bouton absent : ${selector}`);
    }
    button.click();
  }

  it('dit en tête les alertes vivantes du point, et qu’elles n’agissent pas sur la boutique', async () => {
    const alerts = new FakeAlerts();
    await alerts.declare('site_v', 'CRO', 'out_of_stock');
    alerts.calls.length = 0;
    const { fixture } = await mount(
      ['handover_counter:read'],
      new FakeReceipts(),
      counter(),
      alerts,
    );

    expect(alerts.calls).toEqual(['list site_v']);
    const card = root(fixture).querySelector('[data-stock-alerts]');
    expect(card?.querySelector('[data-stock-alert="CRO"]')?.textContent).toContain('Rupture');
    expect(card?.querySelector('[data-stock-alert="CRO"]')?.textContent).toContain('Croissant');
    expect(card?.querySelector('[data-stock-alerts-no-effect]')?.textContent).toContain(
      'Sans effet sur la boutique',
    );
    // Lecture seule : aucun geste.
    expect(root(fixture).querySelector('[data-stock-alert-actions]')).toBeNull();
    expect(root(fixture).querySelector('[data-stock-alerts-declare]')).toBeNull();
  });

  it('déclare depuis le catalogue (combobox), puis redéclare et lève', async () => {
    const { fixture, alerts } = await mount(WRITE);
    const card: unknown = fixture.debugElement.query(
      By.css('app-stock-alerts-card'),
    ).componentInstance;
    if (!(card instanceof StockAlertsCard)) {
      throw new Error('la carte des alertes manque');
    }
    card['pickedSku'].set('PAC');
    await settle(fixture);

    click(fixture, '[data-stock-alerts-declare] [data-stock-alert-declare="low"]');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-stock-alert="PAC"]')?.textContent).toContain(
      'Stock faible',
    );

    click(fixture, '[data-stock-alert="PAC"] [data-stock-alert-declare="out_of_stock"]');
    await settle(fixture);
    click(fixture, '[data-stock-alert="PAC"] [data-stock-alert-lift]');
    await settle(fixture);

    expect(alerts.calls.filter((c) => !c.startsWith('list'))).toEqual([
      'declare PAC low',
      'declare PAC out_of_stock',
      'lift alert_PAC',
    ]);
    expect(root(fixture).querySelector('[data-stock-alert="PAC"]')).toBeNull();
  });

  it('déclare depuis une ligne du stock, et relit les alertes après une réception', async () => {
    const api = new FakeReceipts();
    api.unordered = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 2 }];
    const { fixture, alerts } = await mount(WRITE, api);

    click(fixture, '[data-resupply-line="CRO"] [data-stock-alert-declare="out_of_stock"]');
    await settle(fixture);
    expect(alerts.calls).toContain('declare CRO out_of_stock');
    expect(
      root(fixture).querySelector('[data-resupply-line="CRO"] [data-stock-alert-lift]'),
    ).not.toBeNull();

    const before = alerts.calls.filter((c) => c.startsWith('list')).length;
    const card = unorderedCard(fixture);
    card['pickedSku'].set('PAC');
    card['pickedQuantity'].set(6);
    await card['add']();
    await settle(fixture);
    expect(alerts.calls.filter((c) => c.startsWith('list')).length).toBe(before + 1);
  });

  it('propose d’ajouter l’article en alerte à la demande « au plus tôt » en cours (R1c)', async () => {
    const alerts = new FakeAlerts();
    await alerts.declare('site_v', 'CRO', 'out_of_stock');
    const { fixture, resupplies } = await mount(WRITE, new FakeReceipts(), counter(), alerts);

    click(fixture, '[data-stock-alert="CRO"] [data-asap-draft-open]');
    await settle(fixture);
    const adder: unknown = fixture.debugElement.query(
      By.css('[data-stock-alert="CRO"] app-asap-draft-adder'),
    ).componentInstance;
    if (!(adder instanceof AsapDraftAdder)) {
      throw new Error('la proposition manque');
    }
    adder['quantity'].set(12);
    await settle(fixture);
    click(fixture, '[data-stock-alert="CRO"] [data-asap-draft-add]');
    await settle(fixture);

    expect(resupplies.calls).toEqual(['add site_v asap CRO 12']);
    // La carte de commande, qui partage le même état, montre aussitôt la demande.
    expect(
      root(fixture).querySelector('[data-resupply-draft="asap"] [data-resupply-draft-line="CRO"]'),
    ).not.toBeNull();
  });
});
