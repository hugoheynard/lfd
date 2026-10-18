import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AudienceDimension, AudiencePeriod, AudiencesView } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { AudiencesService } from '../analytics/audiences/audiences.service';

import { declareAudienceAgentTools } from './audience-agent-tools';

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: Record<string, unknown>) => Promise<string>;
}

const VIEW: AudiencesView = {
  days: 7,
  from: '2026-10-12',
  to: '2026-10-18',
  minClients: 5,
  segmentations: [
    {
      dimension: 'clientele',
      cells: [
        { status: 'too_few_clients', key: 'pro', label: 'Professionnels' },
        {
          status: 'shown',
          key: 'public',
          label: 'Particuliers',
          clients: 6,
          orders: 9,
          revenueHtCents: 2_160,
          revenueTtcCents: 2_277,
          averageBasketHtCents: 240,
          averageBasketTtcCents: 253,
          topFamilies: [{ familyId: 'fam-pains', name: 'Pains', revenueHtCents: 2_160 }],
        },
      ],
    },
  ],
  subscriptions: {
    status: 'too_few_clients',
    key: 'subscriptions',
    label: 'Commandes d’abonnement',
  },
};

function armTools(fail = false) {
  const registered = new Map<string, RegisteredTool>();
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
  const asked: { days: AudiencePeriod; dimension: AudienceDimension | undefined }[] = [];
  const api: Pick<AudiencesService, 'read'> = {
    read: (days, dimension) => {
      asked.push({ days, dimension });
      return fail
        ? Promise.reject(
            new HttpErrorResponse({ status: 403, error: { message: 'Accès refusé.' } }),
          )
        : Promise.resolve(VIEW);
    },
  };
  TestBed.configureTestingModule({ providers: [{ provide: AudiencesService, useValue: api }] });
  const names = runInInjectionContext(TestBed.inject(Injector), () => declareAudienceAgentTools());
  function tool(name: string): RegisteredTool {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  }
  return { names, tool, asked };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  TestBed.resetTestingModule();
});

describe('audiences_read', () => {
  it('se déclare seul, en lecture', () => {
    expect(armTools().names).toEqual(['audiences_read']);
  });

  it('rend la période, la règle des cinq clients, les chiffres et le seuil', async () => {
    const { tool, asked } = armTools();
    const text = (
      await tool('audiences_read').execute({ days: 7, dimension: 'clientele' })
    ).replace(/\s/gu, ' ');
    expect(asked).toEqual([{ days: 7, dimension: 'clientele' }]);
    expect(text).toContain('Du 2026-10-12 au 2026-10-18 (7 jours)');
    expect(text).toContain('moins de 5 clients');
    expect(text).toContain('Professionnels [pro] : trop peu de clients');
    expect(text).toContain('Particuliers [public] : 6 clients · 9 commandes');
    expect(text).toContain('familles en tête Pains');
    expect(text).toContain('Commandes d’abonnement [subscriptions] : trop peu de clients');
  });

  it('lit 30 jours et toutes les coupes par défaut', async () => {
    const { tool, asked } = armTools();
    await tool('audiences_read').execute({});
    expect(asked).toEqual([{ days: 30, dimension: undefined }]);
  });

  it('rend un refus lisible au lieu de jeter', async () => {
    const { tool } = armTools(true);
    expect(await tool('audiences_read').execute({})).toContain('REFUSÉ : 403');
  });
});
