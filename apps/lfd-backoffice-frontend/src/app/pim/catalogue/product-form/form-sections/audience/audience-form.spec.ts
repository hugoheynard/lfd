import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OperationAudience } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { AudienceForm } from './audience-form';

function setup(
  write: (id: string, value: OperationAudience | null) => Promise<void>,
  initial: OperationAudience | null = null,
) {
  const audience = signal<OperationAudience | null>(initial);
  const familyAudience = signal<OperationAudience | null>('pro');
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProductFormStore,
        useValue: { audience, familyAudience, productId: () => 'p-tarte' },
      },
      { provide: ProductHttpApi, useValue: { setAudience: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AudienceForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, audience, familyAudience, said };
}

describe('AudienceForm — le sélecteur d’audience de la fiche', () => {
  it('nomme ce dont la fiche hérite, puis les trois audiences', () => {
    const { form, familyAudience } = setup(async () => undefined);
    expect(form['options']().map((option) => option.label)).toEqual([
      'Hérite de la famille (Pros)',
      'Pros',
      'Public',
      'Les deux',
    ]);
    familyAudience.set('both');
    expect(form['options']()[0]?.label).toBe('Hérite de la famille (Les deux)');
  });

  it('montre « hérite » quand la fiche ne déroge pas', () => {
    const { form } = setup(async () => undefined);
    expect(form['choice']()).toBe('inherit');
  });

  it('écrit une dérogation tout de suite', async () => {
    const sent: [string, OperationAudience | null][] = [];
    const { form, audience, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange']('public');
    expect(sent).toEqual([['p-tarte', 'public']]);
    expect(audience()).toBe('public');
    expect(said).toEqual(['ok:Audience de la fiche enregistrée.']);
  });

  it('rend la fiche à sa famille en envoyant `null`', async () => {
    const sent: (OperationAudience | null)[] = [];
    const { form, audience } = setup(async (_id, value) => {
      sent.push(value);
    }, 'both');
    await form['onChange']('inherit');
    expect(sent).toEqual([null]);
    expect(audience()).toBeNull();
  });

  it('un refus remet le choix où il était', async () => {
    const { form, audience, said } = setup(async () => {
      throw new Error('refus');
    }, 'pro');
    await form['onChange']('both');
    expect(audience()).toBe('pro');
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:L'audience n'a pas pu être enregistrée."]);
  });
});
