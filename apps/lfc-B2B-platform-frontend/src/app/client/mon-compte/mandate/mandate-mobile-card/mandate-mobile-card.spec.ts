import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CustomerMandateView, MintBlocker, SepaScheme } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientMandate, type MandateReadStatus } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { MandateOptionsPanel } from '../mandate-options-panel/mandate-options-panel';
import { MandatePanel } from '../mandate-panel/mandate-panel';
import { MandateProofDialog } from '../mandate-proof-dialog/mandate-proof-dialog';
import { MandateMobileCard } from './mandate-mobile-card';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

let ensured: string[];
let reloads: string[];

function render(
  status: MandateReadStatus,
  mandate: CustomerMandateView | null,
  issuerScheme: SepaScheme | null = null,
  mintBlockers: readonly MintBlocker[] = [],
): HTMLElement {
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
          issuerScheme: signal(issuerScheme),
          mintBlockers: signal(mintBlockers),
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
  /** Plan mentions obligatoires §9 : le serveur refuserait, la carte le dit avant le clic. */
  it('sans mandat et avec des mentions manquantes, « Générer » est inerte et la liste s’affiche', () => {
    const el = render('ready', null, 'B2B', ['siren_missing']);

    const button = footButton(el);
    expect(button?.textContent).toContain(FR.account.mandateGenerate);
    expect(button?.disabled).toBe(true);
    expect(el.querySelector('app-mandate-blockers')?.textContent).toContain(
      FR.account.mandateBlockers.siren_missing,
    );
  });

  it('un brouillon en cours ne montre pas la liste : il n’y a rien à générer', () => {
    const el = render('ready', DRAFT, 'B2B', ['siren_missing']);

    expect(el.querySelector('app-mandate-blockers')).toBeNull();
    expect(footButton(el)?.disabled).toBe(false);
  });
  /** Plan-mandat-deux-schemas §10 Q2 : le mandat interentreprises n'imprime ni la zone 14 ni la 19. */
  it('sous un émetteur interentreprises, ne propose pas les options', () => {
    for (const mandate of [null, DRAFT]) {
      const el = render('ready', mandate, 'B2B');
      expect(el.querySelector('button.options')).toBeNull();
    }
  });

  it('sous un émetteur CORE, ou tant que le schéma n’est pas lu, propose les options', () => {
    for (const scheme of ['CORE', null] as const) {
      const el = render('ready', DRAFT, scheme);
      expect(el.querySelector('button.options')).not.toBeNull();
    }
  });

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

  /** Règle « Saisir » : en pile, le dialogue de dépôt est la feuille du bas. */
  it('brouillon : la consigne, la RUM et les deux icônes ; le bouton du bas ouvre le dépôt en feuille', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render('ready', DRAFT);

    expect(el.querySelector('.state')?.textContent?.trim()).toBe(FR.account.mandateAwaiting);
    expect(el.querySelector('.reference')?.textContent?.trim()).toBe('RUM · LFD-MDT-0001');
    expect(el.querySelectorAll('fold-button-icon').length).toBe(2);
    expect(el.textContent).not.toContain(FR.account.mandateAwaitingBody.CORE);
    expect(el.textContent).not.toContain(FR.account.mandateEsign);

    const button = footButton(el);
    expect(button.textContent).toContain(FR.account.mandateSend);
    button.click();
    expect(openedPanel()?.component).toBe(MandateProofDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1' });
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('« Options du mandat » ouvre leur panneau depuis le bas', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render('ready', DRAFT);
    el.querySelector<HTMLButtonElement>('button.options')?.click();

    expect(openedPanel()?.component).toBe(MandateOptionsPanel);
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('actif : l’état, la RUM, la date du papier, et aucun PDF', () => {
    const el = render('ready', { ...DRAFT, status: 'active', acceptedAt: '2026-09-10' });
    expect(el.querySelector('button.options')).toBeNull();

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
