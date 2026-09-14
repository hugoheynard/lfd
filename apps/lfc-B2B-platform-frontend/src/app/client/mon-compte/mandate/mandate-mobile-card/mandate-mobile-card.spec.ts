import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CustomerMandateView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientMandate, type MandateReadStatus } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { MandatePanel } from '../mandate-panel/mandate-panel';
import { MandateMobileCard } from './mandate-mobile-card';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

let ensured: string[];
let reloads: string[];

function render(status: MandateReadStatus, mandate: CustomerMandateView | null): HTMLElement {
  ensured = [];
  reloads = [];
  const fixture = bootCard(
    MandateMobileCard,
    [TOMMEUSES],
    [
      {
        provide: ClientMandate,
        useValue: {
          status: signal(status),
          mandate: signal(mandate),
          ensure: (id: string) => ensured.push(id),
          reload: (id: string) => {
            reloads.push(id);
            return Promise.resolve();
          },
          document: () => Promise.resolve(new Blob(['%PDF'])),
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

describe('MandateMobileCard', () => {
  it('sans mandat, le bouton du bas génère — le panneau monte du bas', () => {
    const el = render('ready', null);
    expect(ensured).toEqual(['cmp_1']);
    expect(el.querySelector('.state')?.textContent?.trim()).toBe(FR.account.mandateNone);

    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const button = footButton(el);
    expect(button.textContent).toContain(FR.account.mandateGenerate);
    button.click();

    expect(openedPanel()?.component).toBe(MandatePanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', generate: true });
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('brouillon : la consigne, la RUM et les deux icônes ; le détail reste au panneau', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render('ready', DRAFT);

    expect(el.querySelector('.state')?.textContent?.trim()).toBe(FR.account.mandateAwaiting);
    expect(el.querySelector('.reference')?.textContent?.trim()).toBe('RUM · LFD-MDT-0001');
    expect(el.querySelectorAll('fold-button-icon').length).toBe(2);
    expect(el.textContent).not.toContain(FR.account.mandateAwaitingBody);
    expect(el.textContent).not.toContain(FR.account.mandateEsign);

    const button = footButton(el);
    expect(button.textContent).toContain(FR.account.mandateSend);
    button.click();
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', generate: false });
  });

  it('actif : l’état, la RUM, la date du papier, et aucun PDF', () => {
    const el = render('ready', { ...DRAFT, status: 'active', acceptedAt: '2026-09-10' });

    expect(el.querySelector('.state')?.textContent?.trim()).toBe(FR.account.mandateActive);
    expect(el.querySelector('.meta')?.textContent?.trim()).toBe('Signé le 10/09/2026');
    expect(el.querySelector('fold-button-icon')).toBeNull();
  });

  it('dit l’échec de lecture, et relit au clic', () => {
    const el = render('failed', null);

    expect(el.textContent).toContain(FR.account.mandateLoadFailedTitle);
    expect(el.querySelector('app-card-foot')).toBeNull();
    el.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(reloads).toEqual(['cmp_1']);
  });
});
