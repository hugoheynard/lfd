import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { MediaThreshold, MediaThresholdsReport } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';
import { MediaThresholds } from './media-thresholds';

const threshold = (over: Partial<MediaThreshold>): MediaThreshold => ({
  key: 'transformations',
  label: 'Transformations Cloudflare',
  measured: 4_400,
  limit: 5_000,
  unit: '/mois',
  estimated: true,
  state: 'attention',
  message: 'Au-delà de 80 % de la limite. À prévoir : Souscrire Images & Stream.',
  source: 'documentation/ops/cloudflare-images.md §5',
  ...over,
});

const REPORT: MediaThresholdsReport = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  images: 1_100,
  thresholds: [
    threshold({}),
    threshold({
      key: 'ranked-sort',
      label: 'Tri par emplois',
      measured: 1_100,
      unit: 'images',
      estimated: false,
      state: 'ok',
      message: 'Sous 80 % de la limite. Rien à faire.',
    }),
  ],
};

class FakeOps {
  fail = false;

  mediaThresholds(): Promise<MediaThresholdsReport> {
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(REPORT);
  }
}

async function render(ops: FakeOps): Promise<ComponentFixture<MediaThresholds>> {
  TestBed.configureTestingModule({
    imports: [MediaThresholds],
    providers: [{ provide: OpsService, useValue: ops }],
  });
  const fixture = TestBed.createComponent(MediaThresholds);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (f: ComponentFixture<MediaThresholds>): HTMLElement => f.nativeElement as HTMLElement;

describe('MediaThresholds', () => {
  it('rend le fonds, chaque seuil, son état et le geste de sortie', async () => {
    const f = await render(new FakeOps());
    const text = host(f).textContent ?? '';

    expect(text).toContain('1,100');
    expect(text).toContain('Transformations Cloudflare');
    expect(text).toContain('Souscrire Images & Stream');
    expect(text).toContain('cloudflare-images.md §5');
    expect(text).toContain('Attention');
    expect(text).toContain('OK');
  });

  it('marque une mesure estimée', async () => {
    const f = await render(new FakeOps());
    const transformations = host(f).querySelector('[data-threshold="transformations"]');

    expect(transformations?.textContent).toContain('≈');
  });

  it('dit que la lecture a échoué plutôt que de se taire', async () => {
    const ops = new FakeOps();
    ops.fail = true;
    const f = await render(ops);

    expect(host(f).textContent).toContain('Seuils illisibles');
  });
});
