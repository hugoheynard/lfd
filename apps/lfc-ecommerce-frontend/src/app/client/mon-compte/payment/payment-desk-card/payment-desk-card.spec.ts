import { TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientLocale } from '../../../client-locale.service';
import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { PaymentPanel } from '../payment-panel/payment-panel';
import { PaymentDeskCard } from './payment-desk-card';

/** Les trois états que `/me` sait dire du crédit mensuel. */
const GRANTED: CompanyView = TOMMEUSES;
const REQUESTED: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: 'monthly' };
const NONE: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: null };
/** Accordé, mais la comptabilité a suspendu le prélèvement. */
const SUSPENDED: CompanyView = { ...TOMMEUSES, directDebitBlocked: true };

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

const badges = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll('fold-badge')).map((b) => b.textContent?.trim() ?? '');

const requestButton = (el: HTMLElement): HTMLButtonElement | undefined =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
    (b) => b.textContent?.trim() === FR.account.termRequest,
  );

const render = (company: CompanyView): HTMLElement =>
  bootCard(PaymentDeskCard, [company]).nativeElement as HTMLElement;

describe('PaymentDeskCard', () => {
  it('accordé : « Actif », la phrase de l’accord, et rien à demander', () => {
    const el = render(GRANTED);

    expect(badges(el)).toEqual([FR.account.stateActive, FR.account.stateAvailable]);
    expect(el.querySelector('.monthly')?.textContent).toContain(FR.account.termGrantedSub);
    expect(el.textContent).toContain(FR.account.paymentNote);
    expect(requestButton(el)).toBeUndefined();
  });

  /** Le crédit n'est pas retiré : le client doit lire qu'il est suspendu, et pourquoi il paie par carte. */
  it('suspendu : « Suspendu », « Prélèvement mensuel suspendu — vos commandes se règlent par carte », rien à demander', () => {
    const el = render(SUSPENDED);

    expect(badges(el)).toEqual([FR.account.stateSuspended, FR.account.stateAvailable]);
    expect(el.querySelector('.monthly')?.textContent).toContain(
      'Prélèvement mensuel suspendu — vos commandes se règlent par carte',
    );
    expect(requestButton(el)).toBeUndefined();
  });

  it('demandé : « En attente », la phrase de la demande, et rien à redemander', () => {
    const el = render(REQUESTED);

    expect(badges(el)).toEqual([FR.account.stateRequested, FR.account.stateAvailable]);
    expect(el.querySelector('.monthly')?.textContent).toContain(FR.account.termRequestedSub);
    expect(requestButton(el)).toBeUndefined();
  });

  it('ni l’un ni l’autre : « Non accordé », sur demande — et le régime ouvert à tous reste disponible', () => {
    const el = render(NONE);

    expect(badges(el)).toEqual([FR.account.stateUnavailable, FR.account.stateAvailable]);
    expect(el.querySelector('.monthly')?.textContent).toContain(FR.account.termNoneSub);
    expect(el.textContent).toContain(FR.account.termOrderSub);
    expect(requestButton(el)).toBeDefined();
  });

  /** L'API refuse la demande aux autres rôles : le geste ne s'y montre pas. */
  it('n’offre « Demander » qu’aux rôles qui écrivent', () => {
    expect(requestButton(render(asRole('orders', NONE)))).toBeUndefined();
    expect(requestButton(render(asRole('billing', NONE)))).toBeUndefined();
    expect(requestButton(render(asRole('admin', NONE)))).toBeDefined();
  });

  it('« Demander » ouvre le panneau Paiement sur la société, son état et le droit de demander', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = render(NONE);

    requestButton(el)?.click();

    const panel = openedPanel();
    expect(panel?.component).toBe(PaymentPanel);
    expect(panel?.side).toBe('right');
    expect(panel?.data).toEqual({ companyId: 'cmp_1', monthly: 'none', canRequest: true });
  });

  /**
   * Régression : la carte affirmait « Accordé le 14/02/2024 · plafond 2 000 € »
   * à tout le monde, écrit en dur. `CompanyView` ne porte ni date d'accord ni
   * plafond ; aucun état, dans aucune langue, ne doit plus en montrer.
   */
  it('n’affiche plus « Accordé le 14/02/2024 · plafond 2 000 € » — ni date ni montant, nulle part', () => {
    for (const company of [GRANTED, REQUESTED, NONE]) {
      const fixture = bootCard(PaymentDeskCard, [company]);
      for (const code of ['fr', 'en', 'it'] as const) {
        TestBed.inject(ClientLocale).current.set(code);
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(text).not.toMatch(/€|2[\s  ,.]?000/);
        expect(text).not.toMatch(/plafond|limit|massimale/i);
      }
    }
  });
});
