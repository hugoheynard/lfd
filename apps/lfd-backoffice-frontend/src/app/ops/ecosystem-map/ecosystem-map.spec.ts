import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { NodeHealth, TrafficWindow } from '@lfd/ops-contract';

import { EcosystemMap } from './ecosystem-map';

const API: NodeHealth = {
  node: 'b2b',
  kind: 'service',
  label: 'API',
  status: 'up',
  since: '2026-01-01T00:00:00.000Z',
  lastHeartbeatAt: null,
  dependsOn: [],
  reason: 'traffic-healthy',
  readings: [],
};

function trafficWindow(overrides: Partial<TrafficWindow>): TrafficWindow {
  return {
    node: 'b2b',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-01T00:05:00.000Z',
    requests: 100,
    serverErrors: 0,
    throttled: 0,
    gatewayFaults: 0,
    p95Ms: 0,
    ...overrides,
  };
}

function render(windows: readonly TrafficWindow[]): ComponentFixture<EcosystemMap> {
  const fixture = TestBed.createComponent(EcosystemMap);
  fixture.componentRef.setInput('nodes', [API]);
  fixture.componentRef.setInput('windows', windows);
  fixture.detectChanges();
  return fixture;
}

const gauge = (f: ComponentFixture<EcosystemMap>): Element | null =>
  (f.nativeElement as HTMLElement).querySelector('.node-gauge');

const squeeze = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

describe('EcosystemMap — la jauge dit ce qu’elle mesure', () => {
  // jsdom n'a pas `matchMedia` ; la carte le lit pour couper l'animation.
  beforeAll(() => {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: (query: string): MediaQueryList => ({ matches: true, media: query }) as MediaQueryList,
    });
  });

  it('affiche le p95 sous le pourcentage quand la latence décide', () => {
    const f = render([trafficWindow({ p95Ms: 470 })]);
    const node = gauge(f);

    expect(squeeze(node?.querySelector('.node-gauge-value')?.textContent)).toBe('40 %');
    expect(squeeze(node?.querySelector('.node-gauge-measure')?.textContent)).toBe('p95 470 ms');
    expect(node?.getAttribute('aria-label')).toContain('d’après la latence');
    expect(node?.getAttribute('aria-label')).toContain('ni un CPU ni une mémoire');
    expect(squeeze(node?.querySelector('title')?.textContent)).toContain('ni un CPU');
  });

  it('affiche la part de 429 quand les rejets décident', () => {
    const f = render([trafficWindow({ p95Ms: 50, throttled: 12 })]);
    const node = gauge(f);

    expect(squeeze(node?.querySelector('.node-gauge-value')?.textContent)).toBe('12 %');
    expect(squeeze(node?.querySelector('.node-gauge-measure')?.textContent)).toBe('12 % en 429');
    expect(node?.getAttribute('aria-label')).toContain('d’après les rejets');
  });

  it('n’affiche aucune jauge sans mesure', () => {
    expect(gauge(render([]))).toBeNull();
    expect(gauge(render([trafficWindow({ requests: 0 })]))).toBeNull();
  });
});
