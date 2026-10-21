import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OperationAudience } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { CategoryHttpApi } from '../../../category-http-api';
import { CategoryFormStore } from '../../category-form-store';
import { CategoryAudienceForm } from './category-audience-form';

function setup(write: (id: string, value: OperationAudience) => Promise<void>) {
  const audience = signal<OperationAudience | null>('both');
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: CategoryFormStore, useValue: { audience, id: () => 'fam_morning' } },
      { provide: CategoryHttpApi, useValue: { setAudience: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CategoryAudienceForm);
  fixture.detectChanges();
  return { form: fixture.componentInstance, audience, said };
}

describe('CategoryAudienceForm — le sélecteur d’audience de la famille', () => {
  it('offre les trois audiences, sans héritage : une famille n’hérite de rien', () => {
    const { form } = setup(async () => undefined);
    expect(form['options'].map((option) => option.label)).toEqual(['Pros', 'Public', 'Les deux']);
  });

  it('écrit tout de suite sur la famille ouverte', async () => {
    const sent: [string, OperationAudience][] = [];
    const { form, audience, said } = setup(async (id, value) => {
      sent.push([id, value]);
    });
    await form['onChange']('pro');
    expect(sent).toEqual([['fam_morning', 'pro']]);
    expect(audience()).toBe('pro');
    expect(said).toEqual(['ok:Audience de la famille enregistrée.']);
  });

  it('n’écrit rien quand on rechoisit la même', async () => {
    const sent: OperationAudience[] = [];
    const { form } = setup(async (_id, value) => {
      sent.push(value);
    });
    await form['onChange']('both');
    expect(sent).toEqual([]);
  });

  it('un refus remet le choix où il était', async () => {
    const { form, audience, said } = setup(async () => {
      throw new Error('refus');
    });
    await form['onChange']('public');
    expect(audience()).toBe('both');
    expect(said).toEqual(["ko:L'audience n'a pas pu être enregistrée."]);
  });
});
