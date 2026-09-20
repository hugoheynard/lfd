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
import { KbisPanel } from '../kbis-panel/kbis-panel';
import { KbisMobileCard } from './kbis-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('KbisMobileCard', () => {
  it('garde l’état et le nom du fichier', () => {
    const el = bootCard(KbisMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;

    expect(el.querySelector('.state')?.textContent).toContain(FR.account.kbisCertified);
    expect(el.querySelector('.name')?.textContent).toContain('kbis-tommeuses.pdf');
  });

  it('« Déposer » à qui peut déposer sans extrait, « Voir » aux autres', () => {
    const none = { ...TOMMEUSES, kbis: null };
    const writer = bootCard(KbisMobileCard, [none]).nativeElement as HTMLElement;
    expect(footButton(writer).textContent).toContain(FR.account.kbisUpload);
    expect(writer.querySelector('.state')?.textContent).toContain(FR.account.kbisNone);

    const reader = bootCard(KbisMobileCard, [asRole('billing', none)]).nativeElement as HTMLElement;
    expect(footButton(reader).textContent).toContain(FR.account.kbisView);

    vi.stubGlobal('matchMedia', matchMediaAt(true));
    footButton(reader).click();
    expect(openedPanel()?.component).toBe(KbisPanel);
    expect(openedPanel()?.data).toMatchObject({ canManage: false });
  });
});
