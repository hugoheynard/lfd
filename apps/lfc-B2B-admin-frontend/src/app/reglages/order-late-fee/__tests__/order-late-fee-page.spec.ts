import { TestBed } from '@angular/core/testing';
import type { OrderLateFeePayload, OrderLateFeeView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import type { VatRate } from '../../../pim/data/models';
import { VatRateHttpApi } from '../../../pim/catalogue/vat-rates/vat-http-api';
import { OrderLateFeePage } from '../order-late-fee-page';
import { OrderLateFeeService } from '../order-late-fee.service';

/** Un taux du référentiel, réduit à ce que l'écran en lit. */
function rate(name: string, percent: number): VatRate {
  return { id: name, name, description: '', percent, usage: {} };
}

interface Harness {
  readonly page: OrderLateFeePage;
  readonly save: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
}

async function mount(setting: OrderLateFeeView, rates: VatRate[] | Error = []): Promise<Harness> {
  const save = vi.fn(async () => undefined);
  const clear = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: OrderLateFeeService,
        useValue: { read: async () => setting, save, clear },
      },
      {
        provide: VatRateHttpApi,
        useValue: {
          list: async () => {
            if (rates instanceof Error) {
              throw rates;
            }
            return rates;
          },
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new OrderLateFeePage());
  // Le constructeur a déjà lancé le chargement ; on le rejoue pour attendre
  // dessus plutôt que d'espérer une microtâche.
  await TestBed.runInInjectionContext(() => page['load']());
  return { page, save, clear };
}

describe("l'écran de surtaxe de retard", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("n'envoie jamais un montant sans taux", async () => {
    // Le serveur LÈVE quand une surtaxe arrive sans taux, au lieu d'en inventer
    // un. L'écran ne doit pas laisser découvrir cette règle en production.
    const { page, save } = await mount(null, [rate('Normal', 20)]);
    page['setFee']({ direction: 'increase', mode: 'amount', cents: 1500 });

    expect(page['missingRate']()).toBe(true);
    await page['submit']();
    expect(save).not.toHaveBeenCalled();
  });

  it('retire le réglage au lieu d’enregistrer un montant nul', async () => {
    // « 0 € de surtaxe » et « pas de surtaxe » se relisent différemment six mois
    // plus tard, et le serveur ne stocke pas le premier.
    const { page, save, clear } = await mount(
      { fee: { mode: 'amount', cents: 1500 }, vatRatePercent: 20 },
      [rate('Normal', 20)],
    );
    page['setFee'](null);

    await page['submit']();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('enregistre le pourcentage choisi, jamais un identifiant de taux', async () => {
    // Ce qui voyage est un nombre : le serveur B2B ne dépend d'aucun taux du
    // référentiel, et cet écran est la seule jonction entre les deux.
    const { page, save } = await mount(null, [rate('Réduit', 5.5), rate('Normal', 20)]);
    page['setFee']({ direction: 'increase', mode: 'percent', bp: 1000 });
    page['onRate']('5.5');

    await page['submit']();
    const payload: OrderLateFeePayload = {
      fee: { mode: 'percent', bp: 1000 },
      vatRatePercent: 5.5,
    };
    expect(save).toHaveBeenCalledWith(payload);
  });

  it('garde proposé un taux qui a disparu du référentiel', async () => {
    // Sans ça, ouvrir l'écran effacerait silencieusement le taux réglé : le
    // sélecteur n'aurait aucune option correspondante, donc plus de valeur.
    const { page } = await mount({ fee: { mode: 'amount', cents: 1500 }, vatRatePercent: 13 }, [
      rate('Normal', 20),
    ]);

    expect(page['orphanRate']()).toBe(true);
    expect(page['rateChoices']().map((choice) => choice.value)).toContain('13');
    expect(page['rateValue']()).toBe('13');
  });

  it('ne propose qu’un choix par pourcentage', async () => {
    // C'est le POURCENTAGE qu'on enregistre : deux taux à 20 % sont le même
    // choix, et deux lignes identiques feraient douter de la différence.
    const { page } = await mount(null, [rate('Normal', 20), rate('Normal bis', 20)]);

    expect(page['rateChoices']()).toHaveLength(1);
  });

  it('reste lisible quand les taux du référentiel ne répondent pas', async () => {
    // Les taux ne sont qu'une liste de choix ; le réglage, lui, est chargé.
    const { page } = await mount(
      { fee: { mode: 'amount', cents: 1500 }, vatRatePercent: 20 },
      new Error('403'),
    );

    expect(page['state']()).toBe('ready');
    expect(page['ratesUnavailable']()).toBe(true);
    // Et surtout : on n'accuse pas le taux d'être orphelin faute d'avoir la liste.
    expect(page['orphanRate']()).toBe(false);
  });
});
