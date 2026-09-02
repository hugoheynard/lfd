import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { B2bDeliveryFactsView, B2bProductDeliveryView } from '@lfd/pim-contracts';
import { B2bChannelApi } from '../../../channels/b2b-channel-api';
import { B2bDelivery } from './b2b-delivery';

/**
 * Ce que ces cas tiennent : **l'écart entre poussée et acceptée**, et le fait
 * qu'on ne crie pas quand l'absence est normale.
 *
 * On passe par le DOM plutôt que par l'instance : les membres sont `protected`,
 * et c'est le gabarit qui décide ce qui s'affiche — ce que `tsc` ne lit pas.
 */

function variant(over: Partial<B2bDeliveryFactsView> = {}): B2bDeliveryFactsView {
  return {
    sku: 'VIE-001-1',
    accepted: true,
    factsReceivedAt: '2026-01-02T09:00:00.000Z',
    awaitingSince: null,
    ...over,
  };
}

function view(over: Partial<B2bProductDeliveryView> = {}): B2bProductDeliveryView {
  return {
    productId: 'prd_1',
    publishedAt: '2026-01-01T09:00:00.000Z',
    lastPushedAt: '2026-01-02T09:00:00.000Z',
    variants: [variant()],
    ...over,
  };
}

class FakeChannel {
  constructor(private readonly answer: B2bProductDeliveryView | Error) {}

  delivery(): Promise<B2bProductDeliveryView> {
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

async function render(answer: B2bProductDeliveryView | Error) {
  TestBed.configureTestingModule({
    imports: [B2bDelivery],
    providers: [{ provide: B2bChannelApi, useValue: new FakeChannel(answer) }],
  });
  const fixture: ComponentFixture<B2bDelivery> = TestBed.createComponent(B2bDelivery);
  fixture.componentRef.setInput('productId', 'prd_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<B2bDelivery>): string =>
  fixture.nativeElement.textContent ?? '';

describe('B2bDelivery — la frise', () => {
  it('dit les trois étapes quand tout est passé', async () => {
    const fixture = await render(view());

    expect(text(fixture)).toContain('Publiée au canal professionnel');
    expect(text(fixture)).toContain('Poussée vers la plateforme');
    expect(text(fixture)).toContain('Acceptée');
  });

  /**
   * 🔴 LE cas qui vaut le bloc. Le push répond `201`, la fiche paraît partie, et
   * la plateforme ne l'a pas — presque toujours une exclusion à la projection.
   * Rien ne le disait, et une fiche en vente nulle part s'affichait comme une
   * fiche en vente.
   */
  it('alerte quand la fiche est poussée et que la plateforme ne l’a pas', async () => {
    const fixture = await render(
      view({ variants: [variant({ accepted: false, factsReceivedAt: null })] }),
    );

    expect(text(fixture)).toContain("La plateforme ne l'a pas");
    expect(text(fixture)).toContain('écartée à la projection');
  });

  /**
   * Publiée mais jamais poussée : l'absence est ATTENDUE. Crier ici userait
   * l'alarme avant le cas où elle compte — c'est la même raison qui fait qu'une
   * seule bannière sonne sur l'écran de validation.
   */
  it('ne crie pas sur une fiche que personne n’a encore poussée', async () => {
    const fixture = await render(
      view({
        lastPushedAt: null,
        variants: [variant({ accepted: false, factsReceivedAt: null })],
      }),
    );

    expect(text(fixture)).toContain('Jamais poussée');
    expect(text(fixture)).not.toContain('écartée à la projection');
  });

  /**
   * Une arrivée en attente explique l'absence : ce n'est pas une anomalie, c'est
   * une relecture qui n'a pas eu lieu. Les deux messages ensemble enverraient
   * chercher la panne au mauvais endroit.
   */
  it('dit l’attente de validation, et se tait sur l’anomalie', async () => {
    const fixture = await render(
      view({
        variants: [
          variant({
            accepted: false,
            factsReceivedAt: null,
            awaitingSince: '2026-01-03T09:00:00.000Z',
          }),
        ],
      }),
    );

    expect(text(fixture)).toContain("attend d'être validée");
    expect(text(fixture)).not.toContain('écartée à la projection');
  });

  it('compte les déclinaisons quand la plateforme n’en tient qu’une partie', async () => {
    const fixture = await render(
      view({
        variants: [
          variant({ sku: 'VIE-001-1' }),
          variant({ sku: 'VIE-001-2', accepted: false, factsReceivedAt: null }),
        ],
      }),
    );

    expect(text(fixture)).toContain('Acceptée en partie — 1 déclinaison sur 2');
  });

  /**
   * Un échec de l'autre contexte ne condamne pas la fiche : le reste du rail
   * reste utilisable, et le bloc se réessaie tout seul.
   */
  it('laisse la fiche intacte quand la plateforme ne répond pas', async () => {
    const fixture = await render(new Error('injoignable'));

    expect(text(fixture)).toContain("n'a pas répondu");
    expect(text(fixture)).toContain('Réessayer');
  });
});
