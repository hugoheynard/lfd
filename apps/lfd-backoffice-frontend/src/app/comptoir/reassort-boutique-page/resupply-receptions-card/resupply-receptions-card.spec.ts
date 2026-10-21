import { TestBed } from '@angular/core/testing';
import type { ResupplyReceptionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ResupplyReceiptsService } from '../resupply-receipts.service';
import { ResupplyReceptionsCard } from './resupply-receptions-card';

/** « Réceptionner » d'un geste, puis l'écart par ligne (lot R2, 2026-10-21). */
const LINE = { sku: 'CRO', label: 'Croissant', expectedQuantity: 24, receivedQuantity: null };
const EXPECTED: ResupplyReceptionView = {
  resupplyId: 'r1',
  target: 'tomorrow',
  origin: 'counter',
  name: null,
  placedAt: '2026-01-01T18:00:00.000Z',
  placedBy: 'Max',
  status: 'expected',
  arrivedAt: null,
  arrivedBy: null,
  receivedAt: null,
  receivedBy: null,
  lines: [LINE],
};

class FakeService {
  readonly calls: string[] = [];
  fail = false;
  receiveResupply(siteId: string, resupplyId: string): Promise<void> {
    this.calls.push(`receive ${siteId} ${resupplyId}`);
    return this.fail ? Promise.reject(new Error('refusé')) : Promise.resolve();
  }
}

function mount(receptions: readonly ResupplyReceptionView[], canWrite: boolean) {
  const service = new FakeService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyReceptionsCard],
    providers: [{ provide: ResupplyReceiptsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(ResupplyReceptionsCard);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('receptions', receptions);
  fixture.componentRef.setInput('canWrite', canWrite);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => (changed += 1));
  fixture.detectChanges();
  return { fixture, service, root: fixture.nativeElement as HTMLElement, changed: () => changed };
}

describe('ResupplyReceptionsCard', () => {
  /** Lot R3e : attendu ou arrivé, et Réceptionner ne l'attend pas. */
  it('dit « Attendu » tant que rien n’est signalé, « Arrivé » ensuite, et laisse réceptionner', () => {
    const arrived: ResupplyReceptionView = {
      ...EXPECTED,
      resupplyId: 'r2',
      arrivedAt: '2026-01-02T06:30:00.000Z',
      arrivedBy: 'Paul',
    };
    const { root } = mount([EXPECTED, arrived], true);

    const first = root.querySelector('[data-resupply-reception="r1"]');
    const second = root.querySelector('[data-resupply-reception="r2"]');
    expect(first?.querySelector('[data-resupply-awaited]')?.textContent).toContain('Attendu');
    expect(first?.querySelector('[data-resupply-arrived]')).toBeNull();
    expect(second?.querySelector('[data-resupply-arrived]')?.textContent).toContain('Arrivé');
    expect(second?.querySelector('[data-resupply-arrived-by]')?.textContent).toContain(
      'Arrivé, signalé par Paul à 07:30',
    );
    expect(root.querySelectorAll('[data-resupply-receive]')).toHaveLength(2);
  });

  it('montre l’attendu en lecture et un seul bouton « Réceptionner », qui prévient la page', async () => {
    const { root, service, changed, fixture } = mount([EXPECTED], true);

    expect(root.querySelector('[data-resupply-reception-line="CRO"]')?.textContent).toContain('24');
    expect(root.querySelectorAll('[data-resupply-receive]')).toHaveLength(1);
    expect(root.querySelector('fold-number-input')).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-resupply-receive]')?.click();
    await fixture.whenStable();

    expect(service.calls).toEqual(['receive site_v r1']);
    expect(changed()).toBe(1);
  });

  it('un réassort nommé se lit sous son nom, la visée à côté (R1g)', () => {
    const { root } = mount(
      [EXPECTED, { ...EXPECTED, resupplyId: 'r2', name: 'Vitrine du matin' }],
      true,
    );

    expect(
      root.querySelector('[data-resupply-reception="r1"] [data-resupply-reception-name]'),
    ).toBeNull();
    const named = root.querySelector('[data-resupply-reception="r2"] .reception-head');
    expect(named?.querySelector('[data-resupply-reception-name]')?.textContent).toBe(
      'Vitrine du matin',
    );
    expect(named?.textContent).toContain('Pour demain');
  });

  it('marque « Envoyé par le fournil » le réassort du fournil, qui se réceptionne en un geste (R1d)', async () => {
    const fromBakehouse: ResupplyReceptionView = { ...EXPECTED, origin: 'bakehouse' };
    const { root, service, fixture } = mount(
      [EXPECTED, { ...fromBakehouse, resupplyId: 'r2' }],
      true,
    );

    expect(
      root.querySelector('[data-resupply-reception="r1"] [data-resupply-reception-bakehouse]'),
    ).toBeNull();
    const marked = root.querySelector('[data-resupply-reception="r2"]');
    expect(marked?.querySelector('[data-resupply-reception-bakehouse]')?.textContent).toContain(
      'Envoyé par le fournil',
    );

    marked?.querySelector<HTMLButtonElement>('[data-resupply-receive]')?.click();
    await fixture.whenStable();

    expect(service.calls).toEqual(['receive site_v r2']);
  });

  it('dit le refus du serveur sans prévenir la page', async () => {
    const { root, service, changed, fixture } = mount([EXPECTED], true);
    service.fail = true;

    root.querySelector<HTMLButtonElement>('[data-resupply-receive]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changed()).toBe(0);
    expect(root.querySelector('fold-callout')).not.toBeNull();
  });

  it('réceptionné : qui et quand, le reçu corrigeable ; en lecture seule, rien à faire', () => {
    const received: ResupplyReceptionView = {
      ...EXPECTED,
      status: 'received',
      receivedAt: '2026-01-02T07:05:00.000Z',
      receivedBy: 'Lou',
      lines: [{ ...LINE, receivedQuantity: 24 }],
    };
    const writer = mount([received], true);
    expect(writer.root.querySelector('[data-resupply-received-by]')?.textContent).toContain(
      'Réceptionné par Lou à 08:05',
    );
    expect(writer.root.querySelector('fold-number-input')).not.toBeNull();
    expect(writer.root.querySelector('[data-resupply-receive]')).toBeNull();

    const reader = mount([EXPECTED], false);
    expect(reader.root.querySelector('[data-resupply-receive]')).toBeNull();
  });

  it('sans réassort envoyé, le dit', () => {
    const { root } = mount([], true);
    expect(root.querySelector('[data-resupply-receptions-empty]')).not.toBeNull();
  });
});
