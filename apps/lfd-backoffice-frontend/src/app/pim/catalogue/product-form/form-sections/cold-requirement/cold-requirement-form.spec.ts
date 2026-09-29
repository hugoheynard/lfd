import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { ColdRequirementForm } from './cold-requirement-form';

function setup(write: (id: string, value: boolean) => Promise<void>) {
  const requiresCold = signal(false);
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: { requiresCold, productId: () => 'p-tarte' } },
      { provide: ProductHttpApi, useValue: { setColdRequirement: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ColdRequirementForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, requiresCold, said };
}

describe('ColdRequirementForm', () => {
  it('dit ce que la case fait, et où ça compte', () => {
    const { fixture } = setup(async () => undefined);
    const box = (fixture.nativeElement as HTMLElement).querySelector('fold-checkbox');
    expect(box?.getAttribute('label')).toBe('Demande le froid (conservation réfrigérée)');
    expect(box?.getAttribute('hint')).toContain('bac isotherme');
  });

  it('écrit tout de suite sur la fiche ouverte', async () => {
    const sent: [string, boolean][] = [];
    const { form, requiresCold, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange'](true);
    expect(sent).toEqual([['p-tarte', true]]);
    expect(requiresCold()).toBe(true);
    expect(said).toEqual(["ok:L'article demande le froid."]);
  });

  it('un refus remet la case où elle était', async () => {
    const { form, requiresCold, said } = setup(async () => {
      throw new Error('refus');
    });
    await form['onChange'](true);
    expect(requiresCold()).toBe(false);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:Le réglage n'a pas pu être enregistré."]);
  });
});
