import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { PricingProbeReport, PricingProbeRow } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';
import { PricingProbe } from './pricing-probe';

const row = (over: Partial<PricingProbeRow>): PricingProbeRow => ({
  caller: 'checkout',
  audience: 'pro',
  lots: 12,
  p50Ms: 40,
  p95Ms: 320,
  meanItems: 7.5,
  state: 'exceeded',
  ...over,
});

const report = (rows: readonly PricingProbeRow[]): PricingProbeReport => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  windowMinutes: 30,
  p95ThresholdMs: 300,
  perInstance: true,
  rows,
});

class FakeOps {
  fail = false;
  rows: readonly PricingProbeRow[] = [
    row({}),
    row({ caller: 'shelf', audience: 'public', p95Ms: 12, state: 'ok' }),
  ];

  pricingProbe(): Promise<PricingProbeReport> {
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(report(this.rows));
  }
}

async function render(ops: FakeOps): Promise<ComponentFixture<PricingProbe>> {
  TestBed.configureTestingModule({
    imports: [PricingProbe],
    providers: [{ provide: OpsService, useValue: ops }],
  });
  const fixture = TestBed.createComponent(PricingProbe);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (f: ComponentFixture<PricingProbe>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('PricingProbe', () => {
  it('porte le titre « Temps de calcul des prix »', async () => {
    const f = await render(new FakeOps());

    expect(text(f)).toContain('Temps de calcul des prix');
  });

  it('rend chaque appelant lisible, ses chiffres et son état', async () => {
    const f = await render(new FakeOps());
    const shown = text(f);

    expect(shown).toContain('Passation');
    expect(shown).toContain('Rayon');
    expect(shown).toContain('Public');
    expect(shown).toContain('320 ms');
    expect(shown).toContain('7.5');
    expect(shown).toContain('Lent');
    expect(shown).toContain('OK');
  });

  it('dit sa fenêtre, son seuil, et qu’elle ne voit que son instance', async () => {
    const shown = text(await render(new FakeOps()));

    expect(shown).toContain('30 dernières minutes');
    expect(shown).toContain('300 ms');
    expect(shown).toContain('cette instance seulement');
  });

  it('dit qu’aucun prix n’a été calculé plutôt que d’afficher des zéros', async () => {
    const ops = new FakeOps();
    ops.rows = [];

    expect(text(await render(ops))).toContain('Aucun prix calculé sur la fenêtre');
  });

  it('dit que la lecture a échoué plutôt que de se taire', async () => {
    const ops = new FakeOps();
    ops.fail = true;

    expect(text(await render(ops))).toContain('Sonde illisible');
  });
});
