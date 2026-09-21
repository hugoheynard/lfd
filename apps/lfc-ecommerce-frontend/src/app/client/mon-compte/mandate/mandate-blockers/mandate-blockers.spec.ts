import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MintBlocker } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientMandate } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { BankPanel } from '../../bank/bank-panel/bank-panel';
import { IdentityPanel } from '../../identity/identity-panel/identity-panel';
import { MandateBlockers } from './mandate-blockers';

function render(blockers: readonly MintBlocker[], stack = false): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateBlockers],
    providers: [
      { provide: ClientCompany, useValue: { company: signal(TOMMEUSES) } },
      { provide: ClientBankAccount, useValue: { account: signal(null) } },
      { provide: ClientMandate, useValue: { refresh: () => Promise.resolve() } },
    ],
  });
  const fixture = TestBed.createComponent(MandateBlockers);
  fixture.componentRef.setInput('blockers', blockers);
  fixture.componentRef.setInput('stack', stack);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('MandateBlockers', () => {
  it('nomme chaque mention manquante, dans l’ordre du serveur', () => {
    const el = render(['siren_missing', 'holder_legal_form_missing']);

    expect(el.textContent).toContain(FR.account.mandateBlockedLead);
    expect(Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim())).toEqual([
      FR.account.mandateBlockers.siren_missing,
      FR.account.mandateBlockers.holder_legal_form_missing,
    ]);
  });

  it('le SIREN ou la raison sociale ouvrent le dialogue d’identité, empilé dans un panneau', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = render(['company_name_missing'], true);
    // Le descripteur d'un panneau ouvert ne dit pas s'il s'est empilé : on lit la demande.
    const open = vi.spyOn(TestBed.inject(FoldPanelHostService), 'open');

    expect(el.querySelector('button.to-bank')).toBeNull();
    el.querySelector<HTMLButtonElement>('button.to-identity')?.click();

    expect(openedPanel()?.component).toBe(IdentityPanel);
    expect(openedPanel()?.side).toBe('center');
    expect(open.mock.calls[0]?.[1]).toMatchObject({ stack: true });
    vi.restoreAllMocks();
  });

  it('le RIB ou la forme juridique du titulaire ouvrent le dialogue RIB', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render(['bank_account_missing', 'holder_legal_form_missing']);

    expect(el.querySelector('button.to-identity')).toBeNull();
    el.querySelector<HTMLButtonElement>('button.to-bank')?.click();

    expect(openedPanel()?.component).toBe(BankPanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', account: null });
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('un émetteur manquant se dit sans geste : il se règle de notre côté', () => {
    const el = render(['issuer_missing']);

    expect(el.textContent).toContain(FR.account.mandateBlockers.issuer_missing);
    expect(el.querySelectorAll('button').length).toBe(0);
  });
});
