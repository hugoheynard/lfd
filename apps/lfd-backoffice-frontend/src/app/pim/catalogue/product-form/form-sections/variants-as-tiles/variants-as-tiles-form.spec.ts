import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { VariantsAsTilesForm } from './variants-as-tiles-form';

function setup(write: (id: string, value: boolean) => Promise<void>) {
  const variantsAsTiles = signal(true);
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: { variantsAsTiles, productId: () => 'p-tarte' } },
      { provide: ProductHttpApi, useValue: { setVariantsAsTiles: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(VariantsAsTilesForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, variantsAsTiles, said };
}

describe('VariantsAsTilesForm', () => {
  it('dit ce que la case fait, et où ça compte', () => {
    const { fixture } = setup(async () => undefined);
    const box = (fixture.nativeElement as HTMLElement).querySelector('fold-checkbox');
    expect(box?.getAttribute('label')).toBe('Montrer chaque déclinaison en vignette');
    expect(box?.getAttribute('hint')).toContain('déclinaison par défaut');
  });

  it('écrit tout de suite sur la fiche ouverte', async () => {
    const sent: [string, boolean][] = [];
    const { form, variantsAsTiles, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange'](false);
    expect(sent).toEqual([['p-tarte', false]]);
    expect(variantsAsTiles()).toBe(false);
    expect(said).toEqual(['ok:Seule la déclinaison par défaut paraît en boutique.']);
  });

  it('un refus remet la case où elle était', async () => {
    const { form, variantsAsTiles, said } = setup(async () => {
      throw new Error('refus');
    });
    await form['onChange'](false);
    expect(variantsAsTiles()).toBe(true);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:Le réglage n'a pas pu être enregistré."]);
  });
});
