import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { EN } from '../../../copy/en';
import { FR } from '../../../copy/fr';
import { ClientLocale } from '../../../client-locale.service';
import { PaymentPanel, type PaymentPanelData } from './payment-panel';

/** Ce que les doublés ont vu passer : les demandes, et les fermetures du panneau. */
interface Wire {
  asks: { companyId: string; term: string }[];
  answer: string | null;
  closes: unknown[];
  /** Posé, retient la réponse jusqu'à ce qu'on le libère. */
  gate: Promise<void> | null;
}

let wire: Wire;

const CAN_REQUEST: PaymentPanelData = { companyId: 'cmp_1', monthly: 'none', canRequest: true };

function boot(data: PaymentPanelData): ComponentFixture<PaymentPanel> {
  wire = { asks: [], answer: null, closes: [], gate: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PaymentPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          askPaymentTerm: async (companyId: string, term: string): Promise<string | null> => {
            wire.asks.push({ companyId, term });
            await wire.gate;
            return wire.answer;
          },
        },
      },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, (result) => wire.closes.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(PaymentPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('PaymentPanel', () => {
  let fixture: ComponentFixture<PaymentPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const badges = (): string[] =>
    Array.from(el().querySelectorAll('fold-badge')).map((b) => b.textContent?.trim() ?? '');

  const button = (text: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button[foldButton]')).find((b) =>
      (b.textContent ?? '').includes(text),
    );

  const request = async (): Promise<void> => {
    button(FR.account.termRequest)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it.each([
    ['granted', FR.account.stateActive, FR.account.termGrantedSub],
    ['requested', FR.account.stateRequested, FR.account.termRequestedSub],
    ['none', FR.account.stateUnavailable, FR.account.termNoneSub],
  ] as const)(
    'crédit « %s » : sa pastille, sa phrase, et le régime ouvert à tous',
    (monthly, badge, note) => {
      fixture = boot({ companyId: 'cmp_1', monthly, canRequest: false });

      expect(badges()).toEqual([badge, FR.account.stateAvailable]);
      expect(el().querySelector('.monthly')?.textContent).toContain(note);
      expect(el().textContent).toContain(FR.account.paymentNote);
    },
  );

  it('sans droit de demander : ni pied, ni geste, ni phrase de demande', () => {
    for (const monthly of ['granted', 'requested', 'none'] as const) {
      fixture = boot({ companyId: 'cmp_1', monthly, canRequest: false });
      expect(el().querySelector('fold-panel-footer')).toBeNull();
      expect(el().querySelectorAll('button[foldButton]').length).toBe(0);
      expect(el().textContent).not.toContain(FR.account.termRequestNote);
    }
  });

  it('avec le droit : dit que c’est une demande, et l’envoie pour CETTE société, en mensuel', async () => {
    fixture = boot(CAN_REQUEST);
    expect(el().querySelector('fold-callout')?.textContent).toContain(FR.account.termRequestNote);

    await request();

    expect(wire.asks).toEqual([{ companyId: 'cmp_1', term: 'monthly' }]);
  });

  it('se ferme avec `true` quand la demande aboutit', async () => {
    fixture = boot(CAN_REQUEST);

    await request();

    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
    fixture = boot(CAN_REQUEST);
    wire.answer = 'Réservé au gestionnaire de la société.';

    await request();

    expect(wire.closes).toEqual([]);
    expect(button(FR.account.termRequest)?.disabled).toBe(false);
    const alert = el().querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.termRequestFailed);
    expect(alert?.textContent).toContain('Réservé au gestionnaire de la société.');
  });

  it('le refus s’efface quand on retente, et la réussite ferme', async () => {
    fixture = boot(CAN_REQUEST);
    wire.answer = 'Refus.';
    await request();
    expect(el().querySelector('fold-callout[variant="alert"]')).not.toBeNull();

    wire.answer = null;
    await request();

    expect(wire.asks.length).toBe(2);
    expect(wire.closes).toEqual([true]);
  });

  it('une demande en vol ne repart pas au second clic', async () => {
    fixture = boot(CAN_REQUEST);
    let release: () => void = () => undefined;
    wire.gate = new Promise<void>((resolve) => (release = resolve));

    button(FR.account.termRequest)?.click();
    fixture.detectChanges();
    button(FR.account.termRequest)?.click();
    expect(wire.asks.length).toBe(1);
    expect(button(FR.account.termRequest)?.disabled).toBe(true);

    release();
    // `whenStable` ne suit pas une promesse retenue à la main : on vide les microtâches.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    expect(wire.asks.length).toBe(1);
    expect(wire.closes).toEqual([true]);
  });

  it('Annuler ferme sans rien demander', () => {
    fixture = boot(CAN_REQUEST);

    button(FR.account.cancel)?.click();

    expect(wire.asks).toEqual([]);
    expect(wire.closes).toEqual([undefined]);
  });

  it('suit la langue de l’écran', () => {
    fixture = boot(CAN_REQUEST);
    TestBed.inject(ClientLocale).current.set('en');
    fixture.detectChanges();

    expect(badges()).toEqual([EN.account.stateUnavailable, EN.account.stateAvailable]);
    expect(button(EN.account.termRequest)).toBeDefined();
  });

  /** Régression : « Accordé le 14/02/2024 · plafond 2 000 € » était écrit en dur dans ce panneau. */
  it('n’affiche plus aucune date d’accord ni aucun plafond', () => {
    for (const monthly of ['granted', 'requested', 'none'] as const) {
      fixture = boot({ companyId: 'cmp_1', monthly, canRequest: monthly === 'none' });
      const text = el().textContent ?? '';
      expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}|€|plafond/);
    }
  });
});
