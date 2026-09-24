import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { OperationOnlyForm } from './operation-only-form';

function setup(write: (id: string, value: boolean) => Promise<void>) {
  const operationOnly = signal(false);
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: { operationOnly, productId: () => 'p-buche' } },
      { provide: ProductHttpApi, useValue: { setOperationOnly: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OperationOnlyForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, operationOnly, said };
}

describe('OperationOnlyForm', () => {
  it('dit ce que la case fait, hors opération comprise', () => {
    const { fixture } = setup(async () => undefined);
    const box = (fixture.nativeElement as HTMLElement).querySelector('fold-checkbox');
    expect(box?.getAttribute('label')).toBe('Vendu seulement pendant une opération');
    expect(box?.getAttribute('hint')).toContain('ni visible ni commandable');
  });

  it('écrit tout de suite sur la fiche ouverte', async () => {
    const sent: [string, boolean][] = [];
    const { form, operationOnly, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange'](true);
    expect(sent).toEqual([['p-buche', true]]);
    expect(operationOnly()).toBe(true);
    expect(said).toEqual(['ok:Article réservé aux opérations.']);
  });

  it('un refus remet la case où elle était', async () => {
    const { form, operationOnly, said } = setup(async () => {
      throw new Error('refus');
    });
    await form['onChange'](true);
    expect(operationOnly()).toBe(false);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:Le réglage n'a pas pu être enregistré."]);
  });
});
