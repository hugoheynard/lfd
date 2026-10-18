import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CatalogReemissionView } from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReemissionHttpApi } from '../pim/integration/reemission/reemission-http-api';
import { aJob } from '../pim/integration/reemission/__tests__/reemission-fixtures';

import { declarePimReemissionAgentTools } from './pim-agent-reemission-tools';

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: Record<string, string>) => Promise<string>;
}

/** Déclare la trousse devant une passerelle WebMCP doublée (cf. `pim-agent-tools.spec.ts`). */
function arm(latest: CatalogReemissionView | null) {
  const registered: RegisteredTool[] = [];
  const starts: (string | null)[] = [];
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.push(tool);
        return Promise.resolve();
      },
    },
  });
  const api: Pick<ReemissionHttpApi, 'start' | 'byId' | 'latest'> = {
    start: (productId) => {
      starts.push(productId);
      return Promise.resolve('job_9');
    },
    byId: (id) => Promise.resolve(aJob({ id })),
    latest: () => Promise.resolve(latest),
  };
  TestBed.configureTestingModule({ providers: [{ provide: ReemissionHttpApi, useValue: api }] });
  const names = runInInjectionContext(TestBed.inject(Injector), () =>
    declarePimReemissionAgentTools(),
  );
  const tool = (name: string): RegisteredTool => {
    const found = registered.find((candidate) => candidate.name === name);
    if (found === undefined) {
      throw new Error(`Outil ${name} non enregistré.`);
    }
    return found;
  };
  return { names, tool, starts };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('outils de réémission', () => {
  it('lance « tout » sans productId, et rend l’identifiant du travail', async () => {
    const { names, tool, starts } = arm(null);

    const said = await tool('pim_catalog_reemit').execute({});

    expect(names).toEqual(['pim_catalog_reemit', 'pim_catalog_reemission_status']);
    expect(starts).toEqual([null]);
    expect(said).toContain('job_9');
  });

  it('lit la dernière, échecs nommés et arrêt écrit', async () => {
    const { tool } = arm(
      aJob({
        status: 'failed',
        error: 'règles refusées',
        failures: [{ productId: 'prd_2', name: 'Cannelé', reason: 'verrou refusé' }],
      }),
    );

    const said = await tool('pim_catalog_reemission_status').execute({});

    expect(said).toContain('état      : failed');
    expect(said).toContain('prd_2 — Cannelé — verrou refusé');
    expect(said).toContain('règles refusées');
  });

  it('dit qu’il n’y en a jamais eu', async () => {
    const { tool } = arm(null);

    expect(await tool('pim_catalog_reemission_status').execute({})).toContain('Aucune réémission');
  });
});
