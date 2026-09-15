import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  CustomerMandateOptionsView,
  CustomerMandateView,
  SetMandateOptionsPayload,
} from '@lfd/contracts';
import { FoldInputComponent, FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate, type MandateReadStatus } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel } from '../../account.fixture';
import { MandateOptionsPanel } from './mandate-options-panel';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

const SAVED: CustomerMandateOptionsView = { debtorReference: 'C-9P2X4B', contractNumber: 'CT-12' };

interface Wire {
  status: WritableSignal<MandateReadStatus>;
  options: WritableSignal<CustomerMandateOptionsView | null>;
  loads: string[];
  saves: { companyId: string; payload: SetMandateOptionsPayload }[];
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(
  mandate: CustomerMandateView | null,
  options: CustomerMandateOptionsView | null = SAVED,
  status: MandateReadStatus = 'ready',
): ComponentFixture<MandateOptionsPanel> {
  wire = {
    status: signal(status),
    options: signal(options),
    loads: [],
    saves: [],
    answer: null,
    closes: [],
    toasts: [],
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateOptionsPanel],
    providers: [
      {
        provide: ClientMandate,
        useValue: {
          mandate: signal(mandate),
          optionsStatus: wire.status,
          options: wire.options,
          loadOptions: (companyId: string): Promise<void> => {
            wire.loads.push(companyId);
            return Promise.resolve();
          },
          saveOptions: (
            companyId: string,
            payload: SetMandateOptionsPayload,
          ): Promise<string | null> => {
            wire.saves.push({ companyId, payload });
            return Promise.resolve(wire.answer);
          },
        },
      },
      {
        provide: NotifyService,
        useValue: { success: (m: string) => wire.toasts.push(m), error: () => undefined },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(MandateOptionsPanel);
  fixture.componentRef.setInput('data', { companyId: 'cmp_1' });
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<MandateOptionsPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function fields(fixture: ComponentFixture<MandateOptionsPanel>): FoldInputComponent[] {
  return fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .map((node) => node.componentInstance as FoldInputComponent);
}

function type(fixture: ComponentFixture<MandateOptionsPanel>, index: number, value: string): void {
  fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    [index]?.triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

function save(fixture: ComponentFixture<MandateOptionsPanel>): HTMLButtonElement | null {
  return el(fixture).querySelector<HTMLButtonElement>('button.save');
}

describe('MandateOptionsPanel', () => {
  it('relit les zones à l’ouverture et pré-remplit les deux champs', () => {
    const fixture = boot(null);

    expect(wire.loads).toEqual(['cmp_1']);
    expect(fields(fixture).map((field) => field.value())).toEqual(['C-9P2X4B', 'CT-12']);
    expect(el(fixture).textContent).toContain(FR.account.mandateOptionsNotice);
    expect(el(fixture).textContent).toContain(FR.account.mandateOptionsForm.debtorReference);
    expect(el(fixture).textContent).toContain(FR.account.mandateOptionsForm.contractNumber);
  });

  it('pré-remplit quand la lecture arrive après l’ouverture', () => {
    const fixture = boot(null, null, 'loading');
    expect(el(fixture).querySelector('fold-loading')).not.toBeNull();
    expect(save(fixture)?.disabled).toBe(true);

    wire.options.set(SAVED);
    wire.status.set('ready');
    fixture.detectChanges();
    expect(fields(fixture).map((field) => field.value())).toEqual(['C-9P2X4B', 'CT-12']);
  });

  it('enregistre les deux zones nettoyées, annonce et se ferme', async () => {
    const fixture = boot(null);
    type(fixture, 0, '  REF-2026  ');
    type(fixture, 1, '');
    save(fixture)?.click();
    await fixture.whenStable();

    expect(wire.saves).toEqual([
      { companyId: 'cmp_1', payload: { debtorReference: 'REF-2026', contractNumber: '' } },
    ]);
    expect(wire.toasts).toEqual([FR.account.mandateOptionsSavedToast]);
    expect(wire.closes).toEqual([true]);
  });

  /** Plan §9 #4 : les zones sont imprimées — le brouillon devient caduc, et on le dit avant. */
  it('avertit que l’enregistrement annule le brouillon, scanné ou non', () => {
    for (const mandate of [DRAFT, { ...DRAFT, hasProof: true }]) {
      const fixture = boot(mandate);
      expect(el(fixture).querySelector('.draft-warning')?.textContent).toContain(
        FR.account.mandateOptionsDraftWarning,
      );
    }
    for (const mandate of [null, { ...DRAFT, status: 'revoked' as const }]) {
      const fixture = boot(mandate);
      expect(el(fixture).querySelector('.draft-warning')).toBeNull();
    }
  });

  it('un refus du serveur s’affiche tel quel, et le panneau reste ouvert', async () => {
    const fixture = boot({ ...DRAFT, status: 'active' });
    type(fixture, 1, 'CT-13');
    wire.answer = 'Le mandat actif porte déjà ces zones.';
    save(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = el(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.mandateOptionsSaveFailed);
    expect(alert?.textContent).toContain('Le mandat actif porte déjà ces zones.');
    expect(wire.closes).toEqual([]);
    expect(wire.toasts).toEqual([]);
  });

  it('sans RIB, le dit et n’enregistre rien', () => {
    const fixture = boot(null, null);
    expect(el(fixture).textContent).toContain(FR.account.mandateOptionsNoBank);
    expect(el(fixture).querySelector('fold-input')).toBeNull();
    expect(save(fixture)?.disabled).toBe(true);
  });

  it('dit l’échec de lecture, et relit au clic', () => {
    const fixture = boot(null, null, 'failed');
    expect(el(fixture).textContent).toContain(FR.account.mandateOptionsLoadFailedTitle);
    el(fixture).querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(wire.loads).toEqual(['cmp_1', 'cmp_1']);
  });
  /** Règle « Saisir » : réécrire les mêmes zones révoquerait un brouillon pour rien. */
  it('Enregistrer reste désarmé tant que les zones relues n’ont pas changé', () => {
    const fixture = boot(DRAFT);
    expect(save(fixture)?.disabled).toBe(true);

    type(fixture, 1, 'CT-13');
    expect(save(fixture)?.disabled).toBe(false);
    // L'avertissement de brouillon reste dit AVANT l'enregistrement.
    expect(el(fixture).querySelector('.draft-warning')?.textContent).toContain(
      FR.account.mandateOptionsDraftWarning,
    );

    type(fixture, 1, ' CT-12 ');
    expect(save(fixture)?.disabled).toBe(true);
  });

  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    /** Une saisie : feuille du bas sous le pli, dialogue centré au-delà (règle « Saisir »). */
    it('monte du bas sous le pli, et se centre au-delà', () => {
      boot(null);
      const panels = TestBed.inject(FoldPanelHostService);

      vi.stubGlobal('matchMedia', matchMediaAt(true));
      MandateOptionsPanel.open(panels, 'cmp_1');
      expect(openedPanel()).toEqual({
        component: MandateOptionsPanel,
        side: 'bottom',
        data: { companyId: 'cmp_1' },
      });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      MandateOptionsPanel.open(panels, 'cmp_1');
      expect(openedPanel()?.side).toBe('center');
    });
  });
});
