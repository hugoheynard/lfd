import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ResupplyArticleView,
  ResupplyTarget,
  SiteResuppliesView,
  SiteResupplyDraftView,
  SiteResupplyView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { SiteResuppliesService } from '../site-resupplies.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { ResupplyOrderCard } from './resupply-order-card';

/**
 * Commander le réassort (R1, puis R1c, 2026-10-21) : deux visées, une
 * DEMANDE EN COURS enregistrée par visée — ajouter (la quantité
 * s'additionne), corriger, retirer, « Envoyer le réassort » —, puis la liste
 * des réassorts envoyés, annulables. Les journées viennent du serveur.
 */
const TODAY = '2026-01-02';
const TOMORROW = '2026-01-03';
const ARTICLES: readonly ResupplyArticleView[] = [
  { sku: 'CRO', name: 'Croissant' },
  { sku: 'PAC', name: 'Pain au chocolat' },
];

const nameOf = (sku: string): string => ARTICLES.find((a) => a.sku === sku)?.name ?? sku;

/** Un serveur en mémoire : chaque geste change ce que la lecture rend, version comprise. */
class FakeResupplies {
  readonly calls: string[] = [];
  drafts: SiteResupplyDraftView[] = [];
  resupplies: SiteResupplyView[] = [];
  orderUntil: string | null = '2026-01-02T17:00:00.000Z';
  refuse: Error | null = null;
  private sequence = 0;

  list(siteId: string): Promise<SiteResuppliesView> {
    this.calls.push(`list ${siteId}`);
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TOMORROW,
      tomorrowOrderUntil: this.orderUntil,
      drafts: this.drafts,
      resupplies: this.resupplies,
    });
  }

  addLine(
    siteId: string,
    target: ResupplyTarget,
    sku: string,
    quantity: number,
  ): Promise<{ id: string }> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(`add ${siteId} ${target} ${sku} ${String(quantity)}`);
    const open = this.drafts.find((d) => d.target === target) ?? this.open(target);
    const present = open.lines.some((l) => l.sku === sku);
    this.replace({
      ...open,
      version: open.version + 1,
      lines: present
        ? open.lines.map((l) => (l.sku === sku ? { ...l, quantity: l.quantity + quantity } : l))
        : [...open.lines, { sku, label: nameOf(sku), quantity }],
    });
    return Promise.resolve({ id: open.id });
  }

  correctLine(siteId: string, id: string, sku: string, quantity: number, version: number) {
    this.calls.push(`correct ${siteId} ${id} ${sku} ${String(quantity)} v${String(version)}`);
    const draft = this.drafts.find((d) => d.id === id);
    if (draft !== undefined) {
      this.replace({
        ...draft,
        version: draft.version + 1,
        lines: draft.lines.map((l) => (l.sku === sku ? { ...l, quantity } : l)),
      });
    }
    return Promise.resolve();
  }

  withdrawLine(siteId: string, id: string, sku: string, version: number): Promise<void> {
    this.calls.push(`withdraw ${siteId} ${id} ${sku} v${String(version)}`);
    const draft = this.drafts.find((d) => d.id === id);
    if (draft !== undefined) {
      this.replace({
        ...draft,
        version: draft.version + 1,
        lines: draft.lines.filter((l) => l.sku !== sku),
      });
    }
    return Promise.resolve();
  }

  send(siteId: string, id: string, version: number): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(`send ${siteId} ${id} v${String(version)}`);
    const draft = this.drafts.find((d) => d.id === id);
    if (draft !== undefined) {
      this.drafts = this.drafts.filter((d) => d.id !== id);
      this.resupplies = [
        {
          id,
          siteId,
          serviceDay: draft.serviceDay,
          target: draft.target,
          origin: 'counter',
          status: 'placed',
          lines: draft.lines,
          placedAt: '2026-01-02T15:00:00.000Z',
          placedBy: 'Lou',
          cancelledAt: null,
          cancelledBy: null,
        },
        ...this.resupplies,
      ];
    }
    return Promise.resolve();
  }

  cancel(siteId: string, id: string): Promise<void> {
    this.calls.push(`cancel ${siteId} ${id}`);
    this.resupplies = this.resupplies.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r));
    return Promise.resolve();
  }

  private open(target: ResupplyTarget): SiteResupplyDraftView {
    this.sequence += 1;
    return {
      id: `draft${String(this.sequence)}`,
      target,
      serviceDay: target === 'tomorrow' ? TOMORROW : TODAY,
      version: 0,
      lines: [],
    };
  }

  private replace(draft: SiteResupplyDraftView): void {
    this.drafts = [...this.drafts.filter((d) => d.id !== draft.id), draft];
  }
}

async function settle(fixture: ComponentFixture<ResupplyOrderCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const WRITE: readonly StaffPermission[] = ['handover_counter:read', 'handover_counter:write'];

async function mount(
  permissions: readonly StaffPermission[],
  api = new FakeResupplies(),
): Promise<{ fixture: ComponentFixture<ResupplyOrderCard>; api: FakeResupplies }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyOrderCard],
    providers: [
      SiteResuppliesStore,
      { provide: SiteResuppliesService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ResupplyOrderCard);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('articles', ARTICLES);
  await settle(fixture);
  return { fixture, api };
}

const root = (fixture: ComponentFixture<ResupplyOrderCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function click(fixture: ComponentFixture<ResupplyOrderCard>, selector: string): void {
  const button = root(fixture).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`bouton absent : ${selector}`);
  }
  button.click();
}

async function add(
  fixture: ComponentFixture<ResupplyOrderCard>,
  target: ResupplyTarget,
  sku: string,
  quantity: number,
): Promise<void> {
  const card = fixture.componentInstance;
  card['pick'](target);
  card['pickedSku'].set(sku);
  card['pickedQuantity'].set(quantity);
  await card['addLine']();
  await settle(fixture);
}

describe('ResupplyOrderCard', () => {
  it('en lecture seule : la demande en cours et la liste, sans aucun geste', async () => {
    const api = new FakeResupplies();
    await api.addLine('site_v', 'asap', 'PAC', 2);
    await api.addLine('site_v', 'tomorrow', 'CRO', 4);
    await api.send('site_v', 'draft2', 1);
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('[data-resupply-target]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-cancel]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-send]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-draft="asap"]')?.textContent).toContain(
      'Pain au chocolat',
    );
    const tomorrow = root(fixture).querySelector(`[data-resupply-day="${TOMORROW}"]`);
    expect(tomorrow?.textContent).toContain('4 × Croissant');
    expect(tomorrow?.textContent).toContain('Pour demain');
    expect(root(fixture).querySelector(`[data-resupply-day="${TODAY}"]`)?.textContent).toContain(
      'Aucun réassort envoyé',
    );
  });

  it('chaque ajout s’écrit et se relit : un article déjà présent voit sa quantité s’additionner', async () => {
    const { fixture, api } = await mount(WRITE);

    fixture.componentInstance['pick']('tomorrow');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-resupply-until]')?.textContent).toContain('18:00');
    await add(fixture, 'tomorrow', 'CRO', 24);
    await add(fixture, 'tomorrow', 'CRO', 6);

    expect(api.calls.filter((c) => c.startsWith('add'))).toEqual([
      'add site_v tomorrow CRO 24',
      'add site_v tomorrow CRO 6',
    ]);
    const line = root(fixture).querySelector(
      '[data-resupply-draft="tomorrow"] [data-resupply-draft-line="CRO"]',
    );
    expect(line).not.toBeNull();
    expect(fixture.componentInstance['drafts']()[0]?.lines[0]?.quantity).toBe(30);
    expect(fixture.componentInstance['pickedSku']()).toBeNull();
  });

  it('corrige et retire sous la version lue, puis envoie ; la demande quitte « en cours »', async () => {
    const { fixture, api } = await mount(WRITE);
    await add(fixture, 'asap', 'CRO', 5);
    await add(fixture, 'asap', 'PAC', 2);
    const card = fixture.componentInstance;
    const draft = card['drafts']()[0];
    const croissant = draft?.lines[0];
    if (draft === undefined || croissant === undefined) {
      throw new Error('la demande en cours manque');
    }

    card['setQuantity'](draft, croissant, 9);
    await settle(fixture);
    click(fixture, '[data-resupply-draft-line="CRO"] [data-resupply-correct]');
    await settle(fixture);
    click(fixture, '[data-resupply-draft-line="PAC"] [data-resupply-withdraw]');
    await settle(fixture);
    click(fixture, '[data-resupply-draft="asap"] [data-resupply-send]');
    await settle(fixture);

    expect(api.calls.filter((c) => !c.startsWith('list') && !c.startsWith('add'))).toEqual([
      'correct site_v draft1 CRO 9 v2',
      'withdraw site_v draft1 PAC v3',
      'send site_v draft1 v4',
    ]);
    expect(root(fixture).querySelector('[data-resupply-draft]')).toBeNull();
    expect(root(fixture).querySelector(`[data-resupply-day="${TODAY}"]`)?.textContent).toContain(
      '9 × Croissant',
    );
  });

  it('une demande vide ne s’envoie pas ; une quantité nulle ne s’ajoute pas', async () => {
    const api = new FakeResupplies();
    await api.addLine('site_v', 'asap', 'CRO', 1);
    await api.withdrawLine('site_v', 'draft1', 'CRO', 1);
    const { fixture } = await mount(WRITE, api);
    const card = fixture.componentInstance;

    const send = root(fixture).querySelector<HTMLButtonElement>('[data-resupply-send]');
    expect(send?.disabled).toBe(true);
    card['pick']('asap');
    card['pickedSku'].set('CRO');
    card['pickedQuantity'].set(0);
    expect(card['canAdd']()).toBe(false);
  });

  it('dit le refus du serveur, et relit la demande telle qu’elle est', async () => {
    const api = new FakeResupplies();
    await api.addLine('site_v', 'tomorrow', 'CRO', 3);
    api.refuse = new Error('L’heure limite est passée');
    const { fixture } = await mount(WRITE, api);
    const before = api.calls.filter((c) => c.startsWith('list')).length;

    click(fixture, '[data-resupply-draft="tomorrow"] [data-resupply-send]');
    await settle(fixture);

    expect(fixture.componentInstance['failure']()).not.toBeNull();
    expect(root(fixture).querySelector('fold-callout')).not.toBeNull();
    expect(api.calls.filter((c) => c.startsWith('list')).length).toBe(before + 1);
    expect(root(fixture).querySelector('[data-resupply-draft="tomorrow"]')).not.toBeNull();
  });

  it('annule un réassort envoyé, et relit', async () => {
    const api = new FakeResupplies();
    await api.addLine('site_v', 'asap', 'CRO', 4);
    await api.send('site_v', 'draft1', 1);
    const { fixture } = await mount(WRITE, api);

    click(fixture, '[data-resupply-cancel]');
    await settle(fixture);

    expect(api.calls).toContain('cancel site_v draft1');
    expect(root(fixture).querySelector('[data-resupply-cancel]')).toBeNull();
    expect(root(fixture).textContent).toContain('Annulé');
  });

  it('revenir sur l’onglet relit la demande : un autre poste l’a remplie', async () => {
    const { fixture, api } = await mount(WRITE);
    await api.addLine('site_v', 'asap', 'PAC', 3);

    document.dispatchEvent(new Event('visibilitychange'));
    await settle(fixture);

    expect(
      root(fixture).querySelector('[data-resupply-draft="asap"] [data-resupply-draft-line="PAC"]'),
    ).not.toBeNull();
  });

  it('suit le point : un autre point relit sa demande et oublie la visée choisie', async () => {
    const { fixture, api } = await mount(WRITE);
    const card = fixture.componentInstance;
    card['pick']('asap');

    fixture.componentRef.setInput('siteId', 'site_l');
    await settle(fixture);

    expect(api.calls).toEqual(['list site_v', 'list site_l']);
    expect(card['target']()).toBeNull();
  });
});
