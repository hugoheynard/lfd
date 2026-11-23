import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { ProspectPanel } from './prospect-panel';

type CreateInput = Parameters<AdminCompaniesService['create']>[0];

let created: CreateInput[] = [];
let closedWith: unknown[] = [];

beforeEach(() => {
  created = [];
  closedWith = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: {
          create: (input: CreateInput) => {
            created.push(input);
            return Promise.resolve({ id: 'cmp_new', holder: 'attached', mailSent: false });
          },
        } satisfies Pick<AdminCompaniesService, 'create'>,
      },
      { provide: FoldPanelRef, useValue: { close: (value?: unknown) => closedWith.push(value) } },
    ],
  });
});

function type(host: HTMLElement, field: string, value: string): void {
  const input = host.querySelector<HTMLInputElement>(`[data-${field}] input`);
  if (input === null) {
    throw new Error(`champ ${field} introuvable`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('ProspectPanel — nouvelle enseigne', () => {
  it('🔴 crée le compte SANS e-mail au contact, puis rend son id', async () => {
    const fixture = TestBed.createComponent(ProspectPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    type(host, 'enseigne', 'Chez Lulu');
    type(host, 'first-name', 'Lucie');
    type(host, 'email', 'lucie@chezlulu.fr');
    type(host, 'phone', '06 12 34 56 78');
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();

    expect(created).toHaveLength(1);
    expect(created[0]?.announceHolder).toBe(false);
    expect(created[0]?.identity.enseigne).toBe('Chez Lulu');
    expect(created[0]?.contact?.email).toBe('lucie@chezlulu.fr');
    expect(closedWith).toEqual(['cmp_new']);
  });

  it('incomplète : le bouton reste grisé, rien ne part', () => {
    const fixture = TestBed.createComponent(ProspectPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    type(host, 'enseigne', 'Chez Lulu');
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
    expect(created).toHaveLength(0);
  });
});
