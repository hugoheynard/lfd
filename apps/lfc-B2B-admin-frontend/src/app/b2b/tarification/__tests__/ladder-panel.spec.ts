import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { SetVolumeLadderPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LadderPanel, type LadderPanelData } from '../ladder-panel/ladder-panel';
import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/**
 * **Le barème, saisi d'un seul geste.**
 *
 * Le serveur refuse un barème qui régresse — mais le découvrir en cliquant
 * ferait recommencer une saisie de cinq lignes. Ce panneau le dit pendant qu'on
 * écrit, et c'est ce que ce fichier vérifie.
 */

const DATA: LadderPanelData = {
  scope: { type: 'product', id: 'VIE-001' },
  target: 'Croissant',
  tiers: [],
  unit: 'percent',
};

function mount(posted: SetVolumeLadderPayload[]): ComponentFixture<LadderPanel> {
  const service: Pick<TarificationService, 'setVolumeLadder'> = {
    setVolumeLadder: (payload) => {
      posted.push(payload);
      return Promise.resolve('ladder_1');
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(LadderPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return fixture;
}

/** Remplit les paliers demandés, en ajoutant les lignes nécessaires. */
function fill(panel: LadderPanel, tiers: readonly [number, number][]): void {
  tiers.forEach(([quantity, value], index) => {
    if (index > 0) {
      panel['addTier']();
    }
    panel['setQuantity'](index, String(quantity));
    panel['setValue'](index, String(value));
  });
}

describe('la saisie du barème', () => {
  it('convertit les pourcents en points de base, et trie les paliers', async () => {
    const posted: SetVolumeLadderPayload[] = [];
    const panel = mount(posted).componentInstance;
    fill(panel, [
      [100, 10],
      [50, 5],
    ]);
    panel['label'].set('Barème croissant');

    await panel['submit']();

    expect(posted[0]?.tiers).toEqual([
      { minQuantity: 50, value: 500 },
      { minQuantity: 100, value: 1_000 },
    ]);
  });

  /**
   * **Le refus qui justifie l'échelle**, dit avant l'envoi : « 50+ à −10 %,
   * 100+ à −5 % » ferait fondre la remise d'un client qui passe de 90 à 100.
   */
  it('annonce un barème qui régresse, et refuse de l’envoyer', async () => {
    const posted: SetVolumeLadderPayload[] = [];
    const panel = mount(posted).componentInstance;
    fill(panel, [
      [50, 10],
      [100, 5],
    ]);
    panel['label'].set('Barème bancal');

    expect(panel['problem']()).toContain('rapporterait moins');
    await panel['submit']();
    expect(posted).toEqual([]);
  });

  it('annonce deux paliers à la même quantité', () => {
    const panel = mount([]).componentInstance;
    fill(panel, [
      [50, 5],
      [50, 8],
    ]);

    expect(panel['problem']()).toContain('lequel gagnerait');
  });

  /** Un plateau n'est pas une régression : deux paliers peuvent accorder autant. */
  it('accepte deux paliers à la même remise', () => {
    const panel = mount([]).componentInstance;
    fill(panel, [
      [50, 5],
      [100, 5],
    ]);

    expect(panel['problem']()).toBeNull();
  });

  it('réclame au moins un palier complet', () => {
    expect(mount([]).componentInstance['problem']()).toContain('au moins un palier');
  });

  /** Un barème sans palier n'existe pas : la dernière ligne ne se retire pas. */
  it('refuse de retirer le dernier palier', () => {
    const panel = mount([]).componentInstance;

    panel['removeTier'](0);

    expect(panel['tiers']().length).toBe(1);
  });

  /**
   * **Régression : un montant part en MILLICENTIMES.**
   *
   * Ce cas affirmait l'inverse — « convertit les euros en centimes, avec le même
   * facteur » — et attendait `20` pour 0,20 €. Il verrouillait le défaut : un
   * palier « −0,20 € » remisait 0,0002 €. Le facteur n'est le même que pour les
   * points de base ; un montant altère un PRIX UNITAIRE, qui vit en
   * millicentimes.
   */
  it('convertit les euros en millicentimes, pas en centimes', async () => {
    const posted: SetVolumeLadderPayload[] = [];
    const panel = mount(posted).componentInstance;
    panel['setUnit']('amount');
    fill(panel, [[50, 0.2]]);
    panel['label'].set('Barème en euros');

    await panel['submit']();

    expect(posted[0]?.tiers).toEqual([{ minQuantity: 50, value: 20_000 }]);
    expect(posted[0]?.unit).toBe('amount');
  });

  /** Le pourcentage, lui, n'a jamais changé : 5 % font 500 points de base. */
  it('laisse un pourcentage en points de base', async () => {
    const posted: SetVolumeLadderPayload[] = [];
    const panel = mount(posted).componentInstance;
    panel['setUnit']('percent');
    fill(panel, [[50, 5]]);
    panel['label'].set('Barème en pourcent');

    await panel['submit']();

    expect(posted[0]?.tiers).toEqual([{ minQuantity: 50, value: 500 }]);
  });
});
