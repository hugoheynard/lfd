import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DeadLettersView } from '@lfd/contracts';
import type {
  CapabilitiesReport,
  EcosystemHealth,
  MediaThresholdsReport,
  NodeHealth,
  TrafficReport,
} from '@lfd/ops-contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OpsService } from '../ops/ops.service';

import { declareOpsAgentTools } from './ops-agent-tools';

type ToolArgs = Record<string, string | number | boolean>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

function node(id: string, overrides: Partial<NodeHealth> = {}): NodeHealth {
  return {
    node: id,
    kind: 'service',
    label: id,
    status: 'up',
    since: '2026-10-11T08:00:00.000Z',
    lastHeartbeatAt: null,
    dependsOn: [],
    reason: 'traffic-healthy',
    readings: [],
    ...overrides,
  };
}

const HEALTH: EcosystemHealth = {
  generatedAt: '2026-10-11T09:00:00.000Z',
  nodes: [
    node('pim'),
    node('lfd', {
      status: 'down',
      reason: 'probe-failed',
      lastError: { at: 'hier', message: 'ECONNREFUSED' },
    }),
    node('mailer', { status: 'degraded', reason: 'error-rate' }),
  ],
  containerUsage: null,
  containerUsageGap: null,
};

const TRAFFIC: TrafficReport = {
  generatedAt: '2026-10-11T09:00:00.000Z',
  source: 'rehearsal',
  series: [],
  windows: [
    {
      node: 'lfd',
      from: 'a',
      to: 'b',
      requests: 200,
      serverErrors: 4,
      gatewayFaults: 0,
      throttled: 3,
      p95Ms: 120,
      surfaces: [
        {
          surface: 'orders',
          requests: 50,
          serverErrors: 0,
          gatewayFaults: 0,
          throttled: 0,
          p95Ms: 80,
        },
        {
          surface: 'admin/companies',
          requests: 150,
          serverErrors: 4,
          gatewayFaults: 0,
          throttled: 3,
          p95Ms: 140,
        },
      ],
    },
  ],
};

const CAPABILITIES: CapabilitiesReport = {
  revision: 'abc123',
  missing: [
    {
      capability: 'Météo',
      setting: 'WEATHER_KEY',
      consequence: 'pas de météo',
      severity: 'degraded',
    },
    {
      capability: 'Courrier',
      setting: 'RESEND_API_KEY',
      consequence: 'aucun e-mail ne part',
      severity: 'blocking',
    },
  ],
};

const MEDIA: MediaThresholdsReport = {
  generatedAt: '2026-10-11T09:00:00.000Z',
  images: 900,
  thresholds: [],
};

const DEAD: DeadLettersView = {
  truncated: true,
  letters: [
    {
      eventId: 'e1',
      subscriber: 'mailer.order-paid',
      type: 'order.paid',
      key: 'order.paid:o1',
      occurredAt: '2026-10-11T08:00:00.000Z',
      attempts: 8,
      lastError: 'boîte pleine',
    },
  ],
};

function armTools(options: { healthFails?: boolean } = {}) {
  const registered = new Map<string, RegisteredTool>();
  const asked: number[] = [];
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });
  const ops: Pick<
    OpsService,
    'health' | 'traffic' | 'capabilities' | 'mediaThresholds' | 'deadLetters'
  > = {
    health: () =>
      options.healthFails === true
        ? Promise.reject(
            new HttpErrorResponse({ status: 403, error: { message: 'Accès refusé à la carte.' } }),
          )
        : Promise.resolve(HEALTH),
    traffic: (minutes) => {
      asked.push(minutes);
      return Promise.resolve(TRAFFIC);
    },
    capabilities: () => Promise.resolve(CAPABILITIES),
    mediaThresholds: () => Promise.resolve(MEDIA),
    deadLetters: () => Promise.resolve(DEAD),
  };
  TestBed.configureTestingModule({ providers: [{ provide: OpsService, useValue: ops }] });
  const names = runInInjectionContext(TestBed.inject(Injector), () => declareOpsAgentTools());

  function tool(name: string): RegisteredTool {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  }
  return { names, tool, asked };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareOpsAgentTools', () => {
  it("rend les noms qu'il enregistre, tous préfixés `ops_`, et aucun rejeu", () => {
    const { names, tool } = armTools();
    for (const name of names) {
      expect(tool(name).name).toBe(name);
      expect(name.startsWith('ops_')).toBe(true);
    }
    for (const forbidden of ['replay', 'retry', 'recompute']) {
      expect(names.some((name) => name.includes(forbidden))).toBe(false);
    }
  });

  it('ops_health met les briques en panne puis dégradées en tête, raison en français', async () => {
    const { tool } = armTools();
    const text = await tool('ops_health').execute({});

    const lines = text.split('\n').filter((line) => /^[A-Z]+ —/.test(line));
    expect(lines.map((line) => line.split(' — ')[0])).toEqual(['DOWN', 'DEGRADED', 'UP']);
    expect(text).toContain('sonde en échec');
    expect(text).toContain('ECONNREFUSED');
    expect(text).toContain('2 en panne ou dégradée(s)');
  });

  it('ops_health rend un refus lisible au lieu de jeter', async () => {
    const { tool } = armTools({ healthFails: true });
    const text = await tool('ops_health').execute({});
    expect(text).toContain('REFUSÉ : 403');
  });

  it('ops_traffic borne la fenêtre et dit quand les chiffres sont une répétition', async () => {
    const { tool, asked } = armTools();

    const text = await tool('ops_traffic').execute({ minutes: 99_999 });
    await tool('ops_traffic').execute({});
    await tool('ops_traffic').execute({ minutes: 0 });

    expect(asked).toEqual([1440, 5, 1]);
    expect(text).toContain('RÉPÉTITION');
    expect(text).toContain('2.0 % erreurs serveur');
    expect(text).toContain('3 rejet(s) du limiteur');
    // La surface la plus appelée vient d'abord.
    expect(text.indexOf('admin/companies')).toBeLessThan(text.indexOf('orders'));
  });

  it('ops_capabilities met le bloquant d’abord et nomme la variable', async () => {
    const { tool } = armTools();
    const text = await tool('ops_capabilities').execute({});
    expect(text.indexOf('BLOQUANT')).toBeLessThan(text.indexOf('DÉGRADÉ'));
    expect(text).toContain('variable RESEND_API_KEY');
  });

  it('ops_dead_letters nomme l’abonné qui bloque et dit que la liste est coupée', async () => {
    const { tool } = armTools();
    const text = await tool('ops_dead_letters').execute({});
    expect(text).toContain('order.paid → mailer.order-paid');
    expect(text).toContain('liste COUPÉE');
  });

  it('ops_media_thresholds lit le fonds', async () => {
    const { tool } = armTools();
    expect(await tool('ops_media_thresholds').execute({})).toContain('Fonds de 900 image(s)');
  });
});
