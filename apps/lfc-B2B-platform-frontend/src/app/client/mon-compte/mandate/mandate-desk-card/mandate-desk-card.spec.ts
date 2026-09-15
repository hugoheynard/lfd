import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CustomerMandateView, MintBlocker, SepaScheme } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientMandate, type MandateReadStatus } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { MandateOptionsPanel } from '../mandate-options-panel/mandate-options-panel';
import { MandatePanel } from '../mandate-panel/mandate-panel';
import { MandateDeskCard } from './mandate-desk-card';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

interface Wire {
  ensured: string[];
  reloads: string[];
  documents: { companyId: string; inline: boolean }[];
}

let wire: Wire;

function render(
  status: MandateReadStatus,
  mandate: CustomerMandateView | null,
  issuerScheme: SepaScheme | null = null,
  mintBlockers: readonly MintBlocker[] = [],
): HTMLElement {
  wire = { ensured: [], reloads: [], documents: [] };
  const fixture = bootCard(
    MandateDeskCard,
    [TOMMEUSES],
    [
      {
        provide: ClientMandate,
        useValue: {
          status: signal(status),
          mandate: signal(mandate),
          issuerScheme: signal(issuerScheme),
          mintBlockers: signal(mintBlockers),
          ensure: (id: string) => wire.ensured.push(id),
          reload: (id: string) => {
            wire.reloads.push(id);
            return Promise.resolve();
          },
          document: (companyId: string, inline: boolean) => {
            wire.documents.push({ companyId, inline });
            return Promise.resolve(new Blob(['%PDF']));
          },
        },
      },
    ],
  );
  return fixture.nativeElement as HTMLElement;
}

const text = (el: HTMLElement, selector: string): string | undefined =>
  el.querySelector(selector)?.textContent?.trim();

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('MandateDeskCard', () => {
  /** Plan mentions obligatoires §9 : le serveur refuserait, la carte le dit avant le clic. */
  it('sans mandat et avec des mentions manquantes, « Générer » est inerte et la liste s’affiche', () => {
    const el = render('ready', null, 'B2B', ['siren_missing']);

    const button = el.querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent).toContain(FR.account.mandateGenerate);
    expect(button?.disabled).toBe(true);
    expect(el.querySelector('app-mandate-blockers')?.textContent).toContain(
      FR.account.mandateBlockers.siren_missing,
    );
  });

  it('un brouillon en cours ne montre pas la liste : il n’y a rien à générer', () => {
    const el = render('ready', DRAFT, 'B2B', ['siren_missing']);

    expect(el.querySelector('app-mandate-blockers')).toBeNull();
    expect(el.querySelector<HTMLButtonElement>('button.action')?.disabled).toBe(false);
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

  it('lit le mandat partagé, et sans mandat propose « Générer mon mandat »', () => {
    const el = render('ready', null);

    expect(wire.ensured).toEqual(['cmp_1']);
    expect(text(el, '.state')).toBe(FR.account.mandateNone);
    expect(el.querySelector('.reference')).toBeNull();
    expect(el.querySelector('fold-button-icon')).toBeNull();

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const button = el.querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent).toContain(FR.account.mandateGenerate);
    button?.click();

    expect(openedPanel()?.component).toBe(MandatePanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', generate: true });
    expect(openedPanel()?.side).toBe('right');
  });

  /** Plan §6 MINEUR : `revoked`, `failed`, `pending` se lisent « aucun mandat en cours ». */
  it('un mandat révoqué, rejeté ou en attente se lit « aucun mandat en cours »', () => {
    for (const status of ['revoked', 'failed', 'pending'] as const) {
      const el = render('ready', { ...DRAFT, status });
      expect(text(el, '.state')).toBe(FR.account.mandateNone);
      expect(el.querySelector('.reference')).toBeNull();
      expect(el.querySelector('button.action')?.textContent).toContain(FR.account.mandateGenerate);
    }
  });

  it('brouillon sans scan : la consigne, la RUM, les deux icônes, et le panneau sans générer', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = render('ready', DRAFT);

    expect(text(el, '.state')).toBe(FR.account.mandateAwaiting);
    expect(text(el, '.reference')).toBe('RUM · LFD-MDT-0001');
    const icons = Array.from(el.querySelectorAll('fold-button-icon'));
    expect(icons.map((icon) => icon.querySelector('button')?.getAttribute('aria-label'))).toEqual([
      FR.account.mandateView,
      FR.account.mandateDownload,
    ]);

    el.querySelector<HTMLButtonElement>('button.action')?.click();
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', generate: false });
    // Le texte détaillé et le dépôt sont dans le panneau, pas sur la carte.
    expect(el.textContent).not.toContain(FR.account.mandateAwaitingBody.CORE);
    expect(el.querySelector('fold-file-dropzone')).toBeNull();
  });

  /** Pas de lien nu : le PDF passe par le client HTTP authentifié, puis un blob. */
  it('« voir » lit le PDF en `inline` et l’ouvre dans un onglet ; « télécharger » sans', async () => {
    const opened: string[] = [];
    vi.stubGlobal('open', (url: string) => opened.push(url));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mandat');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    const el = render('ready', DRAFT);

    const [view, download] = Array.from(el.querySelectorAll('fold-button-icon button'));
    (view as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    (download as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(wire.documents).toEqual([
      { companyId: 'cmp_1', inline: true },
      { companyId: 'cmp_1', inline: false },
    ]);
    expect(opened).toEqual(['blob:mandat']);
    expect(click).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('brouillon avec scan : « en vérification », le nom du fichier, et toujours les icônes', () => {
    const el = render('ready', { ...DRAFT, hasProof: true, proofFileName: 'mandat-signe.pdf' });

    expect(text(el, '.state')).toBe(FR.account.mandateInReview);
    expect(text(el, '.meta')).toBe('Fichier déposé : mandat-signe.pdf');
    expect(el.querySelectorAll('fold-button-icon').length).toBe(2);
    expect(el.querySelector('button.action')?.textContent).toContain(FR.account.details);
  });

  it('actif : « Mandat actif », la RUM et la date du papier — sans PDF à rendre', () => {
    const el = render('ready', { ...DRAFT, status: 'active', acceptedAt: '2026-09-10' });

    expect(text(el, '.state')).toBe(FR.account.mandateActive);
    expect(text(el, '.reference')).toBe('RUM · LFD-MDT-0001');
    expect(text(el, '.meta')).toBe('Signé le 10/09/2026');
    expect(el.querySelector('fold-button-icon')).toBeNull();
  });

  it('« Options du mandat » ouvre leur panneau, sans mandat comme sur un brouillon', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    for (const mandate of [null, DRAFT, { ...DRAFT, hasProof: true }]) {
      TestBed.inject(FoldPanelHostService).dismissAll();
      const el = render('ready', mandate);
      const button = el.querySelector<HTMLButtonElement>('button.options');
      expect(button?.textContent).toContain(FR.account.mandateOptions);
      button?.click();
      expect(openedPanel()?.component).toBe(MandateOptionsPanel);
      expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1' });
    }
  });

  /** Plan §10 : le papier signé porte déjà ces zones, l'API refuse en 409. */
  it('sous un mandat actif, ne propose pas les options', () => {
    const el = render('ready', { ...DRAFT, status: 'active', acceptedAt: '2026-09-10' });
    expect(el.querySelector('button.options')).toBeNull();
  });

  it('dit l’échec de lecture au lieu de « aucun mandat », et relit au clic', () => {
    const el = render('failed', null);

    expect(el.textContent).toContain(FR.account.mandateLoadFailedTitle);
    expect(el.textContent).not.toContain(FR.account.mandateNone);
    expect(el.querySelector('button.action')).toBeNull();
    el.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(wire.reloads).toEqual(['cmp_1']);
  });

  it('pendant la lecture, un chargement fold et aucun geste', () => {
    const el = render('loading', null);
    expect(el.querySelector('fold-loading')).not.toBeNull();
    expect(el.querySelector('button.action')).toBeNull();
  });
});
