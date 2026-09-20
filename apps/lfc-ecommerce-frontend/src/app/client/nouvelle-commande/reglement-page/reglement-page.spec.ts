import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { OrderPaymentIntent } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_DUE, provideRecognised } from '../../client-orders.fixture';
import { ClientOrders } from '../../client-orders.service';
import { FR } from '../../copy/fr';
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
}

async function boot(
  loader: unknown,
  orderId = 'ord_9',
  payment: OrderPaymentIntent | null = CARD_DUE,
): Promise<Booted> {
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
  vi.spyOn(TestBed.inject(ClientOrders), 'paymentFor').mockResolvedValue(payment);

  const fixture = TestBed.createComponent(ReglementPage);
  fixture.detectChanges();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, gone };
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
    expect(gone).toEqual([['/nouvelle-commande/confirmee']]);
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
   * n'est pas une panne : la confirmation porte l'état réel, on y file.
   */
  it('file à la confirmation quand rien n’est à encaisser', async () => {
    const { gone } = await boot(stripeThatAnswers({}), 'ord_reglee', null);

    expect(gone).toEqual([['/nouvelle-commande/confirmee']]);
  });

  /**
   * Le module de paiement indisponible EST une panne, mais la commande, elle,
   * existe : on le dit, et on retire le bouton qui ne peut rien faire.
   */
  it('dit la panne sans faire disparaître la commande', async () => {
    const { fixture } = await boot({ load: () => Promise.resolve(null) });

    expect(text(fixture)).toContain(FR.pay.unavailable);
    expect(text(fixture)).toContain(FR.pay.later);
    expect(() => button(fixture, FR.pay.submit.split('{')[0]!.trim())).toThrow();
  });

  /** Partir sans payer est une sortie assumée : la commande reste, le dû aussi. */
  it('« régler plus tard » mène à la confirmation', async () => {
    const { fixture, gone } = await boot(stripeThatAnswers({}));

    button(fixture, FR.pay.later).click();

    expect(gone).toEqual([['/nouvelle-commande/confirmee']]);
  });
});
