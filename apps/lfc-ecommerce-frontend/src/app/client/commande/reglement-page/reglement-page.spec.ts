import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { OrderPaymentIntent } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AbandonOutcome, ClientOrderAbandon } from '../../client-order-abandon.service';
import { CARD_DUE, provideRecognised } from '../../client-orders.fixture';
import { ClientWorkspace } from '../../client-workspace.service';
import { ClientOrders } from '../../client-orders.service';
import { FR } from '../../copy/fr';
import { NotifyService } from '../../../notify.service';
import { StripeLoader } from '../../stripe-loader.service';
import { ReglementPage } from './reglement-page';

/** Ce que Stripe rend à `confirmPayment`, réduit à ce que l'écran en lit. */
type Outcome =
  { error: { message: string } } | { paymentIntent: { status: string } } | Record<string, never>;

/**
 * Un Stripe **doublé**, et c'est la seule frontière qu'on double ici.
 *
 * Le vrai `loadStripe` injecte un `<script>` distant et monte des iframes : il
 * n'existe ni en SSR ni dans une suite. C'est précisément pour ça que le
 * chargement vit dans `StripeLoader` — le composant de paiement `legacy/`, qui
 * appelle `loadStripe` en direct, n'est traversé par aucun test.
 */
function stripeThatAnswers(outcome: Outcome, mounted: string[] = []) {
  return {
    load: () =>
      Promise.resolve({
        elements: () => ({
          create: (kind: string) => {
            mounted.push(kind);
            return { mount: () => undefined };
          },
        }),
        confirmPayment: () => Promise.resolve(outcome),
      }),
  };
}

interface Booted {
  fixture: ComponentFixture<ReglementPage>;
  /** Les navigations tentées, dans l'ordre — c'est la sortie qu'on éprouve. */
  gone: unknown[][];
  /** Les commandes abandonnées — l'appel au serveur, doublé. */
  abandoned: string[];
}

/** Ce que le serveur répond à l'abandon, et si l'espace est celui d'une société. */
interface Exit {
  readonly outcome?: AbandonOutcome;
  readonly pro?: boolean;
}

async function boot(
  loader: unknown,
  orderId = 'ord_9',
  payment: OrderPaymentIntent | null | 'unreachable' = CARD_DUE,
  exit: Exit = {},
): Promise<Booted> {
  const abandoned: string[] = [];
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReglementPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRecognised(),
      { provide: StripeLoader, useValue: loader },
      { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => orderId }) } },
      {
        provide: ClientOrderAbandon,
        useValue: {
          abandon: (id: string) => {
            abandoned.push(id);
            return Promise.resolve(exit.outcome ?? 'abandoned');
          },
        },
      },
    ],
  });
  const gone: unknown[][] = [];
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation((commands: unknown) => {
    gone.push(commands as unknown[]);
    return Promise.resolve(true);
  });
  // L'intention est POSÉE plutôt que jouée par le réseau : ce qu'on éprouve ici
  // est l'écran, pas la façon dont le service va la chercher — elle a sa propre
  // suite dans `client-orders.service.spec.ts`.
  const paymentFor = vi.spyOn(TestBed.inject(ClientOrders), 'paymentFor');
  if (payment === 'unreachable') {
    paymentFor.mockRejectedValue(new Error('réseau coupé'));
  } else {
    paymentFor.mockResolvedValue(payment);
  }
  // `company` est un `computed` : on le double, on ne sème pas tout un compte.
  vi.spyOn(TestBed.inject(ClientWorkspace), 'company').mockReturnValue(
    exit.pro === true ? ({ id: 'co_1' } as ReturnType<ClientWorkspace['company']>) : null,
  );

  const fixture = TestBed.createComponent(ReglementPage);
  fixture.detectChanges();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, gone, abandoned };
}

const text = (fixture: ComponentFixture<ReglementPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const button = (fixture: ComponentFixture<ReglementPage>, label: string): HTMLButtonElement => {
  const el = fixture.nativeElement as HTMLElement;
  const found = Array.from(el.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!found) {
    throw new Error(`Aucun bouton « ${label} » à l'écran.`);
  }
  return found;
};

/**
 * 🔴 **L'étape qui manquait.** Le serveur créait une intention Stripe à chaque
 * commande client et la rendait dans sa réponse ; rien ne la présentait. Ces cas
 * tiennent ce que l'écran fait de chacune des issues possibles.
 */
describe('ReglementPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('monte le Payment Element et annonce le montant à régler', async () => {
    const mounted: string[] = [];
    const { fixture } = await boot(stripeThatAnswers({}, mounted));

    expect(mounted).toEqual(['payment']);
    expect(text(fixture)).toContain(FR.pay.amount);
    // 12,00 € — le montant vient de l'intention, jamais d'un calcul d'écran.
    expect(text(fixture)).toContain('12,00');
  });

  /**
   * Le succès donne le droit d'AFFICHER « réglé », rien de plus : c'est le
   * webhook serveur qui écrit `paid` dans notre base.
   */
  it('marque la commande réglée et mène à la confirmation sur un succès', async () => {
    const { fixture, gone } = await boot(
      stripeThatAnswers({ paymentIntent: { status: 'succeeded' } }),
    );
    const paid = vi.spyOn(TestBed.inject(ClientOrders), 'markPaid');

    button(fixture, FR.pay.submit.split('{')[0]!.trim()).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(paid).toHaveBeenCalledWith('ord_9');
    expect(gone).toEqual([['/confirmation-de-commande']]);
  });

  /**
   * Le message de Stripe est écrit pour le porteur de la carte. Le remplacer par
   * le nôtre lui retirerait la seule information qui lui permet de corriger.
   */
  it('montre le message de Stripe quand la carte est refusée, et reste sur place', async () => {
    const { fixture, gone } = await boot(
      stripeThatAnswers({ error: { message: 'Fonds insuffisants.' } }),
    );

    button(fixture, FR.pay.submit.split('{')[0]!.trim()).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Fonds insuffisants.');
    expect(gone).toEqual([]);
  });

  /** Ni accepté ni refusé : l'intention n'a pas abouti, et on le dit ainsi. */
  it('le dit quand l’intention n’aboutit pas', async () => {
    const { fixture } = await boot(stripeThatAnswers({ paymentIntent: { status: 'processing' } }));

    button(fixture, FR.pay.submit.split('{')[0]!.trim()).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(text(fixture)).toContain(FR.pay.failed);
  });

  /**
   * Une commande qui n'attend aucun règlement — déjà réglée, portée au compte —
   * n'est pas une panne : on le dit ici, et on renvoie vers « Mes commandes ».
   *
   * Régression : l'écran filait à la confirmation, qui lit l'état « dû » gardé
   * dans le navigateur et reproposait « Régler maintenant » — une boucle
   * confirmation ↔ règlement, dès que le serveur refusait une commande annulée
   * ou une intention close (lot 7, corrigé le 2026-09-26).
   */
  it('dit qu’il n’y a plus rien à régler ici, sans renvoyer à la confirmation', async () => {
    const { fixture, gone } = await boot(stripeThatAnswers({}), 'ord_reglee', null);

    expect(gone).toEqual([]);
    expect(text(fixture)).toContain(FR.pay.closed);
    expect(text(fixture)).not.toContain(FR.pay.abandon);
    expect(() => button(fixture, FR.pay.submit.split('{')[0]!.trim())).toThrow();

    button(fixture, FR.pay.closedAction).click();
    await fixture.whenStable();
    expect(gone).toEqual([['/mes-commandes']]);
  });

  /** Régression : une coupure réseau se disait « plus rien à régler » (2026-09-26). */
  it('dit la panne, pas la clôture, quand le serveur est injoignable', async () => {
    const { fixture, gone } = await boot(stripeThatAnswers({}), 'ord_9', 'unreachable');

    expect(gone).toEqual([]);
    expect(text(fixture)).toContain(FR.pay.unavailable);
    expect(text(fixture)).not.toContain(FR.pay.closed);
    expect(text(fixture)).toContain(FR.pay.abandon);
  });

  /**
   * Le module de paiement indisponible EST une panne, mais la commande, elle,
   * existe : on le dit, et on retire le bouton qui ne peut rien faire.
   */
  it('dit la panne sans faire disparaître la commande', async () => {
    const { fixture } = await boot({ load: () => Promise.resolve(null) });

    expect(text(fixture)).toContain(FR.pay.unavailable);
    expect(text(fixture)).toContain(FR.pay.abandon);
    expect(() => button(fixture, FR.pay.submit.split('{')[0]!.trim())).toThrow();
  });

  /**
   * Régression : « Je règle depuis « Mes commandes » » appelait `later()`, qui ne
   * marquait rien et menait à la confirmation d'une commande que personne ne
   * payait (plan `plan-abandon-du-reglement.md`, §1).
   */
  it('dit la conséquence AVANT d’abandonner, et n’appelle rien sans confirmation', async () => {
    const { fixture, gone, abandoned } = await boot(stripeThatAnswers({}));

    button(fixture, FR.pay.abandon).click();
    fixture.detectChanges();

    expect(text(fixture)).toContain(FR.pay.abandonWarning);
    expect(abandoned).toEqual([]);
    expect(gone).toEqual([]);
  });

  it('abandonne, annonce l’annulation et mène à la boutique', async () => {
    const { fixture, gone, abandoned } = await boot(stripeThatAnswers({}));
    const success = vi.spyOn(TestBed.inject(NotifyService), 'success');

    await leave(fixture);

    expect(abandoned).toEqual(['ord_9']);
    expect(success).toHaveBeenCalledWith(FR.pay.abandoned);
    expect(gone).toEqual([['/boutique']]);
  });

  /** Un pro garde une intention vivante jusqu'à la clôture (Q8, a) : jamais « annulée ». */
  it('ne dit pas « annulée » à un pro, dont la commande reste payable', async () => {
    const { fixture, gone } = await boot(stripeThatAnswers({}), 'ord_9', CARD_DUE, { pro: true });
    const success = vi.spyOn(TestBed.inject(NotifyService), 'success');
    const info = vi.spyOn(TestBed.inject(NotifyService), 'info');

    button(fixture, FR.pay.abandon).click();
    fixture.detectChanges();
    expect(text(fixture)).toContain(FR.pay.abandonWarningPro);
    await confirm(fixture);

    expect(success).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(FR.pay.abandonPending);
    expect(gone).toEqual([['/boutique']]);
  });

  /** De l'argent pris ou en route : la dire annulée serait faux. */
  it('mène à la confirmation quand le paiement a abouti entre-temps', async () => {
    const { fixture, gone } = await boot(stripeThatAnswers({}), 'ord_9', CARD_DUE, {
      outcome: 'settled',
    });
    const info = vi.spyOn(TestBed.inject(NotifyService), 'info');

    await leave(fixture);

    expect(info).toHaveBeenCalledWith(FR.pay.abandonSettled);
    expect(gone).toEqual([['/confirmation-de-commande']]);
  });

  /** §5 « Sortir quand Stripe est injoignable » : la sortie ne dépend de personne. */
  it('part quand même quand l’abandon n’a rien écrit, même Stripe indisponible', async () => {
    const { fixture, gone } = await boot({ load: () => Promise.resolve(null) }, 'ord_9', CARD_DUE, {
      outcome: 'unsettled',
    });
    const info = vi.spyOn(TestBed.inject(NotifyService), 'info');

    await leave(fixture);

    expect(info).toHaveBeenCalledWith(FR.pay.abandonPending);
    expect(gone).toEqual([['/boutique']]);
  });
});

/** Ouvre la confirmation puis la valide. */
async function leave(fixture: ComponentFixture<ReglementPage>): Promise<void> {
  button(fixture, FR.pay.abandon).click();
  fixture.detectChanges();
  await confirm(fixture);
}

async function confirm(fixture: ComponentFixture<ReglementPage>): Promise<void> {
  button(fixture, FR.pay.abandonConfirm).click();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}
