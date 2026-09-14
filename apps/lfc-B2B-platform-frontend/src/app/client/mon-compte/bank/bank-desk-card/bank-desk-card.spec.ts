import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CustomerBankAccountView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { type BankReadStatus, ClientBankAccount } from '../../../client-bank-account.service';
import { FR } from '../../../copy/fr';
import { bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { BankPanel } from '../bank-panel/bank-panel';
import { BankDeskCard } from './bank-desk-card';

const SAVED: CustomerBankAccountView = {
  holder: 'Refuge du Col SARL',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: 'Val d’Isère',
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '1906',
};

let ensured: string[];
let reloads: string[];

function render(status: BankReadStatus, account: CustomerBankAccountView | null): HTMLElement {
  ensured = [];
  reloads = [];
  const fixture = bootCard(
    BankDeskCard,
    [TOMMEUSES],
    [
      {
        provide: ClientBankAccount,
        useValue: {
          status: signal(status),
          account: signal(account),
          ensure: (id: string) => ensured.push(id),
          reload: (id: string) => {
            reloads.push(id);
            return Promise.resolve();
          },
        },
      },
    ],
  );
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('BankDeskCard', () => {
  it('lit le RIB partagé, et ne montre que « RIB enregistré · •••• 1906 »', () => {
    const el = render('ready', SAVED);

    expect(ensured).toEqual(['cmp_1']);
    expect(el.querySelector('.line')?.textContent?.trim()).toBe(
      `${FR.account.bankRegistered} · •••• 1906`,
    );
    // Ni titulaire ni BIC sur la carte : ils sont dans le panneau.
    expect(el.textContent).not.toContain('Refuge du Col');
    expect(el.textContent).not.toContain('CEPAFRPP751');
    expect(el.querySelector('input')).toBeNull();
  });

  it('dit l’absence et propose « Enregistrer », ouvre le formulaire dans le panneau', () => {
    const el = render('ready', null);
    expect(el.querySelector('.line')?.textContent).toContain(FR.account.bankNone);

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const button = el.querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent).toContain(FR.account.bankSave);
    button?.click();

    expect(openedPanel()?.component).toBe(BankPanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', account: null });
  });

  /** Rétabli le 2026-09-14 : le geste d'écriture du RIB manquait au bureau — il ouvre le panneau. */
  it('« Remplacer le RIB » ouvre le panneau sur le RIB enregistré', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = render('ready', SAVED);
    const button = el.querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent).toContain(FR.account.bankReplace);
    button?.click();

    expect(openedPanel()?.component).toBe(BankPanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', account: SAVED });
  });

  it('dit l’échec de lecture au lieu de « aucun RIB », et relit au clic', () => {
    const el = render('failed', null);

    expect(el.textContent).toContain(FR.account.bankLoadFailedTitle);
    expect(el.textContent).not.toContain(FR.account.bankNone);
    el.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(reloads).toEqual(['cmp_1']);
  });
});
