import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { CustomRecipeForm } from './custom-recipe-form';

function setup(write: (id: string, value: boolean) => Promise<void>) {
  const customRecipe = signal(false);
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: { customRecipe, productId: () => 'p-buche' } },
      { provide: ProductHttpApi, useValue: { setCustomRecipe: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CustomRecipeForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, customRecipe, said };
}

describe('CustomRecipeForm', () => {
  it('dit ce que la case fait, sans compte attribué', () => {
    const { fixture } = setup(async () => undefined);
    const box = (fixture.nativeElement as HTMLElement).querySelector('fold-checkbox');
    expect(box?.getAttribute('label')).toBe('Sur mesure');
    expect(box?.getAttribute('hint')).toContain('aucun pro ne le voit');
  });

  it('écrit tout de suite sur la fiche ouverte', async () => {
    const sent: [string, boolean][] = [];
    const { form, customRecipe, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange'](true);
    expect(sent).toEqual([['p-buche', true]]);
    expect(customRecipe()).toBe(true);
    expect(said).toEqual(['ok:Article déclaré sur mesure.']);
  });

  it('un refus remet la case où elle était', async () => {
    const { form, customRecipe, said } = setup(async () => {
      throw new Error('refus');
    });
    await form['onChange'](true);
    expect(customRecipe()).toBe(false);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:Le réglage n'a pas pu être enregistré."]);
  });
});
