import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type {
  ContainerUsage,
  ContainerUsageGap,
  NodeHealth,
  TrafficWindow,
} from '@lfd/ops-contract';

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

const GENERATED_AT = '2026-01-01T00:05:30.000Z';

function render(
  windows: readonly TrafficWindow[],
  container: { usage?: ContainerUsage; gap?: ContainerUsageGap } = {},
): ComponentFixture<EcosystemMap> {
  const fixture = TestBed.createComponent(EcosystemMap);
  fixture.componentRef.setInput('nodes', [API]);
  fixture.componentRef.setInput('windows', windows);
  fixture.componentRef.setInput('containerUsage', container.usage ?? null);
  fixture.componentRef.setInput('containerUsageGap', container.gap ?? null);
  fixture.componentRef.setInput('generatedAt', GENERATED_AT);
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
    expect(node?.getAttribute('aria-label')).toContain('Pression de latence 40 %');
    expect(node?.getAttribute('aria-label')).toContain('ni un CPU ni une mémoire');
    expect(squeeze(node?.querySelector('title')?.textContent)).toContain('ni un CPU');
  });

  it('affiche la part de 429 quand les rejets décident', () => {
    const f = render([trafficWindow({ p95Ms: 50, throttled: 12 })]);
    const node = gauge(f);

    expect(squeeze(node?.querySelector('.node-gauge-value')?.textContent)).toBe('12 %');
    expect(squeeze(node?.querySelector('.node-gauge-measure')?.textContent)).toBe('12 % en 429');
    expect(node?.getAttribute('aria-label')).toContain('Pression de rejet 12 %');
  });

  it('n’affiche aucune jauge sans mesure', () => {
    expect(gauge(render([]))).toBeNull();
    expect(gauge(render([trafficWindow({ requests: 0 })]))).toBeNull();
  });

  it('affiche le CPU et la mémoire du container sur la case API, et la pression dessous', () => {
    const f = render([trafficWindow({ p95Ms: 470 })], {
      usage: {
        cpuPercent: 12.4,
        memoryPercent: 8,
        measuredAt: '2026-01-01T00:03:00.000Z',
        instances: 1,
        instanceType: 'standard-1',
        windowMinutes: 5,
      },
    });
    const node = gauge(f);
    const host = f.nativeElement as HTMLElement;

    expect(squeeze(node?.querySelector('.node-gauge-value')?.textContent)).toBe(
      'CPU 12 % · Mém. 8 %',
    );
    expect(squeeze(node?.querySelector('.node-gauge-measure')?.textContent)).toBe('pression 40 %');
    expect(node?.getAttribute('aria-label')).toContain('Pression de latence 40 %');
    expect(squeeze(host.querySelector('.map-caveat')?.textContent)).toContain(
      'mesuré il y a 2 min',
    );
  });

  it('dit pourquoi le CPU manque, et le geste, sans cacher la pression', () => {
    const f = render([trafficWindow({ p95Ms: 470 })], {
      gap: { reason: 'not-configured', detail: 'Posez CLOUDFLARE_API_CONTAINER_APPLICATION_ID.' },
    });
    const host = f.nativeElement as HTMLElement;

    expect(squeeze(gauge(f)?.querySelector('.node-gauge-value')?.textContent)).toBe(
      'CPU non mesuré',
    );
    expect(squeeze(host.querySelector('fold-callout')?.textContent)).toContain(
      'CLOUDFLARE_API_CONTAINER_APPLICATION_ID',
    );
  });

  it('porte le pire des deux sur la barre : un CPU au plafond l’emporte sur une latence calme', () => {
    const f = render([trafficWindow({ p95Ms: 50 })], {
      usage: {
        cpuPercent: 90,
        memoryPercent: 10,
        measuredAt: '2026-01-01T00:04:00.000Z',
        instances: 1,
        instanceType: 'standard-1',
        windowMinutes: 5,
      },
    });
    const bar = (f.nativeElement as HTMLElement).querySelector('.node-gauge-fill');

    expect(Number(bar?.getAttribute('width'))).toBeCloseTo((208 - 2) * 0.9);
  });
});
