import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { IdentityDeskCard } from './identity-desk-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('IdentityDeskCard', () => {
  it('porte les cinq mentions et la règle écrite, sans champ grisé', () => {
    const el = bootCard(IdentityDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;

    for (const value of ['SAS Les Tommeuses', 'SAS', '81245678900021', 'FR45812456789']) {
      expect(el.querySelector('.facts')?.textContent).toContain(value);
    }
    expect(el.textContent).toContain(FR.account.identityNote);
    expect(el.querySelectorAll('input').length).toBe(0);
  });

  it('lit la forme juridique par son libellé, et une saisie inconnue telle quelle', () => {
    const form = (formeJuridique: string): string => {
      const el = bootCard(IdentityDeskCard, [{ ...TOMMEUSES, formeJuridique }])
        .nativeElement as HTMLElement;
      const dts = Array.from(el.querySelectorAll('.facts dt'));
      const dt = dts.find((node) => node.textContent?.trim() === FR.account.identityForm);
      return dt?.nextElementSibling?.textContent?.trim() ?? '';
    };

    expect(form('sarl')).toBe('SARL');
    expect(form('micro')).toBe('Micro-entreprise');
    expect(form('GIE du Col')).toBe('GIE du Col');
  });

  /** L'API n'écrit l'identité que pour `owner` et `admin` : aux autres, pas de « Modifier ». */
  it('n’offre « Modifier » qu’aux rôles qui écrivent, et ouvre le panneau d’identité', () => {
    for (const role of ['orders', 'billing'] as const) {
      const el = bootCard(IdentityDeskCard, [asRole(role)]).nativeElement as HTMLElement;
      expect(el.querySelector('button[foldButton]')).toBeNull();
    }

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = bootCard(IdentityDeskCard, [asRole('admin')]).nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button[foldButton]')?.click();

    const panel = openedPanel();
    expect(panel?.component).toBe(IdentityPanel);
    // Une saisie : dialogue centré au bureau (règle « Saisir », 2026-09-14).
    expect(panel?.side).toBe('center');
    expect(panel?.data).toMatchObject({
      companyId: 'cmp_1',
      siret: '81245678900021',
      editable: true,
    });
  });
});
