import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import {
  asRole,
  bootCard,
  footButton,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../account.fixture';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { IdentityMobileCard } from './identity-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('IdentityMobileCard', () => {
  it('garde l’enseigne, la raison sociale et le SIRET — la TVA et la règle vont au panneau', () => {
    const el = bootCard(IdentityMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;

    const facts = el.querySelector('.facts')?.textContent ?? '';
    expect(facts).toContain("La Folie Douce Val d'Isère");
    expect(facts).toContain('SAS Les Tommeuses');
    expect(facts).toContain('81245678900021');
    expect(el.textContent).not.toContain('FR45812456789');
    expect(el.textContent).not.toContain(FR.account.identityNote);
  });

  it('« Modifier » aux rôles qui écrivent, « Voir le détail » aux autres — en feuille du bas', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));

    const writer = bootCard(IdentityMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;
    expect(footButton(writer).textContent).toContain(FR.account.edit);

    const reader = bootCard(IdentityMobileCard, [asRole('orders')]).nativeElement as HTMLElement;
    expect(footButton(reader).textContent).toContain(FR.account.details);
    footButton(reader).click();

    const panel = openedPanel();
    expect(panel?.component).toBe(IdentityPanel);
    expect(panel?.side).toBe('bottom');
    expect(panel?.data).toMatchObject({ editable: false });
  });
});
