import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  StaffSuggestionOrder,
  StaffSuggestionRulePayload,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StaffSuggestionsService } from '../suggestions/staff-suggestions.service';
import { staffSuggestion } from '../suggestions/staff-suggestion.testing';

import { declareSuggestionAgentTools, payloadOf } from './suggestion-agent-tools';

type ToolArgs = Record<string, unknown>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

interface Wire {
  readonly rules: StaffSuggestionRuleView[];
  readonly created: StaffSuggestionRulePayload[];
  readonly revised: { readonly id: string; readonly payload: StaffSuggestionRulePayload }[];
  order: StaffSuggestionOrder;
}

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
};

function armTools(canWrite = true) {
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
  const wire: Wire = { rules: [], created: [], revised: [], order: 'recent' };
  const api: Pick<
    StaffSuggestionsService,
    'list' | 'choices' | 'create' | 'revise' | 'setActive' | 'archive' | 'order' | 'setOrder'
  > = {
    list: () => Promise.resolve([...wire.rules]),
    choices: () => Promise.resolve(CHOICES),
    create: (payload) => {
      if (payload.suggestedSkus.includes('VIE-001') && payload.trigger.ref === 'VIE-001') {
        return Promise.reject(
          new HttpErrorResponse({
            status: 400,
            error: {
              message:
                'L’article VIE-001 déclenche la suggestion : il ne peut pas aussi être suggéré.',
            },
          }),
        );
      }
      wire.created.push(payload);
      const id = `R${String(wire.created.length)}`;
      wire.rules.push(staffSuggestion({ id, suggestedSkus: payload.suggestedSkus }));
      return Promise.resolve({ id });
    },
    revise: (id, payload) => {
      wire.revised.push({ id, payload });
      return Promise.resolve({ id });
    },
    setActive: (id, active) => {
      const index = wire.rules.findIndex((rule) => rule.id === id);
      const rule = wire.rules[index];
      if (rule !== undefined) {
        wire.rules[index] = { ...rule, active };
      }
      return Promise.resolve({ id });
    },
    archive: (id) => Promise.resolve({ id }),
    order: () => Promise.resolve({ order: wire.order, updatedAt: null }),
    setOrder: (order) => {
      wire.order = order;
      return Promise.resolve();
    },
  };
  TestBed.configureTestingModule({
    providers: [{ provide: StaffSuggestionsService, useValue: api }],
  });
  const names = runInInjectionContext(TestBed.inject(Injector), () =>
    declareSuggestionAgentTools(canWrite),
  );
  function tool(name: string): RegisteredTool {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  }
  return { names, tool, wire, registered };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareSuggestionAgentTools', () => {
  it('sans le droit d’écriture, ne déclare QUE la lecture', () => {
    const { names, registered } = armTools(false);
    expect(names).toEqual(['suggestion_list', 'suggestion_order_get']);
    expect([...registered.keys()]).toEqual(['suggestion_list', 'suggestion_order_get']);
  });

  it('suggestion_list nomme chaque règle et le catalogue où choisir', async () => {
    const { tool, wire } = armTools();
    wire.rules.push(staffSuggestion({ id: 'R9', active: false }));
    const text = await tool('suggestion_list').execute({});
    expect(text).toContain('id R9 — COUPÉE');
    expect(text).toContain('Article au panier : Croissant');
    expect(text).toContain('PAI-001 Baguette');
    expect(text).toContain('fam-vien Viennoiseries');
  });

  it('crée, puis rend le refus du serveur au lieu de jeter', async () => {
    const { tool, wire } = armTools();
    const base = {
      triggerKind: 'product_in_cart',
      triggerRef: 'VIE-001',
      placement: 'cart',
      audience: 'both',
      startsOn: '2026-10-18',
      endsOn: '2026-10-25',
    };
    expect(
      await tool('suggestion_create').execute({ ...base, suggestedSkus: ['PAI-001'] }),
    ).toContain('CRÉÉE — id R1');
    expect(wire.created[0]?.phrase).toBeNull();
    expect(
      await tool('suggestion_create').execute({ ...base, suggestedSkus: ['VIE-001'] }),
    ).toContain('REFUSÉ : 400 — L’article VIE-001 déclenche la suggestion');
  });

  it('corrige en gardant ce qui est omis, coupe, et règle l’ordre', async () => {
    const { tool, wire } = armTools();
    wire.rules.push(staffSuggestion({ id: 'R1' }));
    await tool('suggestion_update').execute({ id: 'R1', priority: 7 });
    expect(wire.revised[0]?.payload).toMatchObject({
      trigger: { kind: 'product_in_cart', ref: 'VIE-001' },
      suggestedSkus: ['PAI-001'],
      priority: 7,
      phrase: { fr: 'Avec un croissant, la baguette' },
    });
    expect(await tool('suggestion_update').execute({ id: 'nope' })).toContain('REFUSÉ');
    expect(await tool('suggestion_set_active').execute({ id: 'R1', active: false })).toContain(
      'COUPÉE',
    );
    expect(await tool('suggestion_order_set').execute({ order: 'priority' })).toContain(
      '[priority]',
    );
  });
});

describe('payloadOf', () => {
  it('efface la référence quand le déclencheur devient « partout »', () => {
    expect(payloadOf({ triggerKind: 'everywhere' }, staffSuggestion()).trigger).toEqual({
      kind: 'everywhere',
      ref: null,
    });
  });
});
