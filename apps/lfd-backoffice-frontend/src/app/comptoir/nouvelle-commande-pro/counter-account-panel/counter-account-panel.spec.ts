import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { OpenCounterAccountPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { CounterAccountsService } from '../../counter-accounts.service';
import { CounterAccountPanel, IDENTITY_SEEN_HINT } from './counter-account-panel';

let opened: { payload: OpenCounterAccountPayload; key: string }[] = [];
let closedWith: unknown[] = [];
let refuse: string | null = null;

beforeEach(() => {
  opened = [];
  closedWith = [];
  refuse = null;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CounterAccountsService,
        useValue: {
          open: (payload: OpenCounterAccountPayload, key: string) => {
            opened.push({ payload, key });
            return refuse === null
              ? Promise.resolve('cmp_counter')
              : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: refuse } }));
          },
        } satisfies Pick<CounterAccountsService, 'open'>,
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

function fill(host: HTMLElement): void {
  type(host, 'enseigne', 'Chez Lulu');
  type(host, 'first-name', 'Lucie');
  type(host, 'last-name', 'Martin');
  type(host, 'email', 'lucie@chezlulu.fr');
  type(host, 'phone', '06 12 34 56 78');
}

describe('CounterAccountPanel — ouvrir un compte pro au comptoir', () => {
  it('🔴 la case NON cochée ne bloque pas : le compte s’ouvre, identitySeen à false', async () => {
    const fixture = TestBed.createComponent(CounterAccountPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fill(host);
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();

    expect(opened).toHaveLength(1);
    expect(opened[0]?.payload).toEqual({
      enseigne: 'Chez Lulu',
      contact: {
        firstName: 'Lucie',
        lastName: 'Martin',
        fonction: '',
        email: 'lucie@chezlulu.fr',
        phone: '06 12 34 56 78',
      },
      identitySeen: false,
    });
    expect(opened[0]?.key).not.toBe('');
    expect(closedWith).toEqual(['cmp_counter']);
  });

  it('la case cochée part à true, et le texte d’engagement est affiché tel quel', async () => {
    const fixture = TestBed.createComponent(CounterAccountPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-identity-seen]')?.textContent).toContain(IDENTITY_SEEN_HINT);
    fill(host);
    const box = host.querySelector<HTMLInputElement>('[data-identity-seen] input');
    box?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();

    expect(opened[0]?.payload.identitySeen).toBe(true);
  });

  it('incomplète : le bouton reste grisé, rien ne part', () => {
    const fixture = TestBed.createComponent(CounterAccountPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    type(host, 'enseigne', 'Chez Lulu');
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
    expect(opened).toHaveLength(0);
  });

  it('un refus montre le message du serveur et garde le panneau ouvert', async () => {
    refuse = 'Cette adresse e-mail est déjà celle d’un compte.';
    const fixture = TestBed.createComponent(CounterAccountPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fill(host);
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-refusal]')?.textContent).toContain(refuse);
    expect(closedWith).toEqual([]);
  });
});
