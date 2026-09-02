import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { B2bPushSummaryView } from '@lfd/pim-contracts';
import { B2bChannelApi } from '../../channels/b2b-channel-api';
import { PublicationB2b } from './publication-b2b';

/**
 * Ce que ces cas tiennent : **le jeton fait l'aller-retour**.
 *
 * L'écran simule, lit ce qui partirait, puis envoie. Sans l'empreinte rendue par
 * la simulation et redonnée à l'envoi, ces deux gestes sont deux appels que rien
 * ne rattache — et on peut expédier un catalogue que personne n'a relu. C'est le
 * trou que le serveur sait désormais refuser ; encore faut-il que l'écran lui en
 * donne les moyens.
 *
 * On passe par le DOM plutôt que par l'instance : les membres du composant sont
 * `protected`, et surtout c'est le gabarit qui câble les boutons — `tsc` ne le
 * lit pas.
 */

function summary(over: Partial<B2bPushSummaryView> = {}): B2bPushSummaryView {
  return {
    mode: 'dry-run',
    candidates: 3,
    report: null,
    excluded: [],
    fingerprint: 'empreinte-A',
    ...over,
  };
}

/** Note ce que l'écran a demandé — c'est tout le sujet. */
class FakeApi {
  readonly calls: { dryRun: boolean; fingerprint?: string }[] = [];
  next: B2bPushSummaryView = summary();
  rejectLive: Error | null = null;

  push(dryRun: boolean, fingerprint?: string): Promise<B2bPushSummaryView> {
    this.calls.push(fingerprint === undefined ? { dryRun } : { dryRun, fingerprint });
    if (!dryRun && this.rejectLive !== null) {
      return Promise.reject(this.rejectLive);
    }
    return Promise.resolve(this.next);
  }
}

function make(api: FakeApi) {
  TestBed.configureTestingModule({
    imports: [PublicationB2b],
    providers: [{ provide: B2bChannelApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(PublicationB2b);
  fixture.detectChanges();

  const buttonNamed = (label: string): HTMLButtonElement => {
    const found = [...fixture.nativeElement.querySelectorAll('button')].find(
      (node): node is HTMLButtonElement =>
        node instanceof HTMLButtonElement && node.textContent?.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Bouton « ${label} » introuvable.`);
    }
    return found;
  };

  const click = async (label: string): Promise<void> => {
    buttonNamed(label).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { fixture, click, buttonNamed };
}

describe('la publication B2B transporte l’empreinte', () => {
  it('ne joint aucune empreinte à la simulation — c’est elle qui la produit', async () => {
    const api = new FakeApi();
    const { click } = make(api);

    await click('Simuler');

    expect(api.calls).toEqual([{ dryRun: true }]);
  });

  it('redonne à l’envoi l’empreinte lue à la simulation', async () => {
    const api = new FakeApi();
    const { click } = make(api);

    await click('Simuler');
    api.next = summary({ mode: 'live' });
    await click('Envoyer');

    expect(api.calls).toEqual([{ dryRun: true }, { dryRun: false, fingerprint: 'empreinte-A' }]);
  });

  /** Envoyer n'est possible qu'après une simulation : sans jeton, pas d'envoi. */
  it('garde l’envoi désarmé tant que rien n’a été simulé', () => {
    const { buttonNamed } = make(new FakeApi());

    expect(buttonNamed('Envoyer').disabled).toBe(true);
  });

  /**
   * 🔴 Le cas qui évite la boucle. Un refus de dérive laisse l'empreinte
   * périmée : si l'envoi restait armé, le clic suivant repartirait avec elle et
   * l'écran bouclerait sur un refus que l'utilisateur ne saurait pas défaire.
   * Le geste de sortie est de re-simuler, et le désarmement l'impose.
   */
  it('désarme l’envoi après un refus, pour forcer une nouvelle relecture', async () => {
    const api = new FakeApi();
    api.rejectLive = new Error('Le catalogue a changé depuis votre relecture');
    const { click, buttonNamed } = make(api);

    await click('Simuler');
    await click('Envoyer');

    expect(buttonNamed('Envoyer').disabled).toBe(true);
    expect(api.calls).toHaveLength(2);
  });

  /** Une nouvelle simulation remplace le jeton : on n'envoie jamais l'ancien. */
  it('renvoie l’empreinte la PLUS RÉCENTE, pas la première', async () => {
    const api = new FakeApi();
    const { click } = make(api);

    await click('Simuler');
    api.next = summary({ fingerprint: 'empreinte-B' });
    await click('Simuler');
    api.next = summary({ mode: 'live', fingerprint: 'empreinte-B' });
    await click('Envoyer');

    expect(api.calls.at(-1)).toEqual({ dryRun: false, fingerprint: 'empreinte-B' });
  });
});
