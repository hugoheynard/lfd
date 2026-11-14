import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { RouteTimingPass, RouteTimingsReport, RouteTimingsState } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';
import { RouteTimings } from './route-timings';

const pass = (over: Partial<RouteTimingPass>): RouteTimingPass => ({
  pass: 1,
  status: 200,
  totalMs: 120.5,
  marks: [
    { name: 'app', durationMs: 40, description: null },
    { name: 'worker', durationMs: 55, description: null },
    { name: 'gateway', durationMs: 90, description: null },
  ],
  shelfCache: 'miss',
  failure: null,
  ...over,
});

const report = (state: RouteTimingsState): RouteTimingsReport => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  state,
  routes:
    state === 'measured'
      ? [
          {
            key: 'shelf-public',
            path: '/shop/catalogue',
            passes: [pass({}), pass({ pass: 2, totalMs: 12, shelfCache: 'hit' })],
          },
          {
            key: 'health',
            path: '/health',
            passes: [pass({ status: null, marks: [], shelfCache: null, failure: 'timeout' })],
          },
        ]
      : [],
});

class FakeOps {
  calls = 0;
  fail = false;
  state: RouteTimingsState = 'measured';

  routeTimings(): Promise<RouteTimingsReport> {
    this.calls += 1;
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(report(this.state));
  }
}

async function render(ops: FakeOps): Promise<ComponentFixture<RouteTimings>> {
  TestBed.configureTestingModule({
    imports: [RouteTimings],
    providers: [{ provide: OpsService, useValue: ops }],
  });
  const fixture = TestBed.createComponent(RouteTimings);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function clickMeasure(f: ComponentFixture<RouteTimings>): Promise<void> {
  const button = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    'button[titleAction]',
  );
  button?.click();
  await f.whenStable();
  f.detectChanges();
}

const text = (f: ComponentFixture<RouteTimings>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('RouteTimings', () => {
  it('ne mesure rien sans un clic', async () => {
    const ops = new FakeOps();
    const f = await render(ops);

    expect(ops.calls).toBe(0);
    expect(text(f)).toContain('Vitesse des routes');
    expect(text(f)).toContain('Aucune mesure');
  });

  it('rend chaque passage, ses marques, son cache et l’échec nommé', async () => {
    const ops = new FakeOps();
    const f = await render(ops);
    await clickMeasure(f);
    const shown = text(f);

    expect(ops.calls).toBe(1);
    expect(shown).toContain('/shop/catalogue');
    expect(shown).toContain('Froid');
    expect(shown).toContain('Chaud');
    expect(shown).toContain('40 ms');
    expect(shown).toContain('55 ms');
    expect(shown).toContain('90 ms');
    expect(shown).toContain('hit');
    expect(shown).toContain('Délai dépassé');
  });

  it('dit le secret non configuré tel quel', async () => {
    const ops = new FakeOps();
    ops.state = 'secret-missing';
    const f = await render(ops);
    await clickMeasure(f);

    expect(text(f)).toContain('Secret non configuré');
  });

  it('dit l’adresse non configurée tel quel', async () => {
    const ops = new FakeOps();
    ops.state = 'base-url-missing';
    const f = await render(ops);
    await clickMeasure(f);

    expect(text(f)).toContain('Adresse non configurée');
  });

  it('nomme l’échec de l’appel plutôt que de se taire', async () => {
    const ops = new FakeOps();
    ops.fail = true;
    const f = await render(ops);
    await clickMeasure(f);

    expect(text(f)).toContain('Mesure impossible');
  });
});
