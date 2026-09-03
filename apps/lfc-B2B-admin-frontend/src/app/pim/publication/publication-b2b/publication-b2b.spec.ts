import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { B2bPushPreviewView } from '@lfd/contracts';
import type { B2bPushSummaryView } from '@lfd/pim-contracts';
import { B2bChannelApi } from '../../channels/b2b-channel-api';
import { PublicationB2b } from './publication-b2b';

/**
 * Ce que ces cas tiennent, et c'est deux choses.
 *
 * **L'aperçu se lit tout seul.** Il y avait un bouton « Simuler », et il ne
 * proposait aucun choix : on ne décide pas d'envoyer sans voir ce qui partirait,
 * donc toute visite commençait par ce clic. Il n'existait que parce que simuler
 * ÉCRIVAIT — `push({dryRun:true})` pose une ancre de révision. Aucun appel de
 * `push` en simulation ne doit donc plus partir de cet écran.
 *
 * **Le jeton fait l'aller-retour.** Sans l'empreinte rendue par l'aperçu et
 * redonnée à l'envoi, regarder et envoyer sont deux appels que rien ne rattache
 * — et on expédie un catalogue que personne n'a relu.
 *
 * On passe par le DOM plutôt que par l'instance : les membres sont `protected`,
 * et surtout c'est le gabarit qui câble les boutons — `tsc` ne le lit pas.
 */

function preview(over: Partial<B2bPushPreviewView> = {}): B2bPushPreviewView {
  return {
    outgoing: [
      {
        sku: 'CHO-001',
        name: 'Gros florentin lait',
        priceMillicents: 250_000,
        vatRatePercent: 5.5,
        change: 'added',
      },
    ],
    candidates: 3,
    excluded: [],
    removed: [],
    fingerprint: 'empreinte-A',
    parity: {
      referenceCount: 1,
      mirrorCount: 0,
      missing: ['CHO-001'],
      stale: [],
      priceGaps: [],
      vatGaps: [],
      nameGaps: [],
      inSync: false,
    },
    ...over,
  };
}

function summary(over: Partial<B2bPushSummaryView> = {}): B2bPushSummaryView {
  return {
    mode: 'live',
    candidates: 3,
    report: null,
    excluded: [],
    fingerprint: 'empreinte-A',
    ...over,
  };
}

/** Note ce que l'écran a demandé — c'est tout le sujet. */
class FakeApi {
  readonly calls: string[] = [];
  readonly pushes: { dryRun: boolean; fingerprint?: string }[] = [];
  next: B2bPushPreviewView = preview();
  rejectPush: Error | null = null;

  preview(): Promise<B2bPushPreviewView> {
    this.calls.push('preview');
    return Promise.resolve(this.next);
  }

  push(dryRun: boolean, fingerprint?: string): Promise<B2bPushSummaryView> {
    this.calls.push('push');
    this.pushes.push(fingerprint === undefined ? { dryRun } : { dryRun, fingerprint });
    return this.rejectPush === null ? Promise.resolve(summary()) : Promise.reject(this.rejectPush);
  }
}

async function make(api: FakeApi) {
  TestBed.configureTestingModule({
    imports: [PublicationB2b],
    providers: [{ provide: B2bChannelApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(PublicationB2b);
  fixture.detectChanges();
  // L'aperçu part au constructeur : sans cette attente, on assert sur l'écran
  // de chargement et le test passerait pour de mauvaises raisons.
  await fixture.whenStable();
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

describe('la publication B2B lit son aperçu toute seule', () => {
  it('charge ce qui partirait à l’ouverture, sans aucun clic', async () => {
    const api = new FakeApi();
    await make(api);

    expect(api.calls).toEqual(['preview']);
  });

  it('ne demande JAMAIS de simulation — regarder ne doit rien écrire', async () => {
    const api = new FakeApi();
    const { click } = await make(api);

    await click('Envoyer');

    expect(api.pushes.every((call) => !call.dryRun)).toBe(true);
  });

  it('redonne à l’envoi l’empreinte de l’aperçu affiché', async () => {
    const api = new FakeApi();
    const { click } = await make(api);

    await click('Envoyer');

    expect(api.pushes).toEqual([{ dryRun: false, fingerprint: 'empreinte-A' }]);
  });

  /**
   * 🔴 Le cas qui évite la boucle. Un refus de dérive laisse l'empreinte
   * périmée : repartir avec elle bouclerait sur un refus que l'utilisateur ne
   * saurait pas défaire. La relecture d'après l'envoi la remplace, et elle a
   * lieu que l'envoi ait réussi ou non.
   */
  it('relit après un refus, et repart avec la NOUVELLE empreinte', async () => {
    const api = new FakeApi();
    api.rejectPush = new Error('Le catalogue a changé depuis votre relecture');
    const { click } = await make(api);

    await click('Envoyer');
    api.rejectPush = null;
    api.next = preview({ fingerprint: 'empreinte-B' });
    await click('Envoyer');

    expect(api.calls).toEqual(['preview', 'push', 'preview', 'push', 'preview']);
    expect(api.pushes.at(-1)).toEqual({ dryRun: false, fingerprint: 'empreinte-A' });
  });

  /**
   * Les cinq nombres sont la première réponse de l'écran. Le détail se déplie
   * derrière ; la synthèse, elle, doit être là sans qu'on ait rien à ouvrir.
   */
  it('affiche la synthèse chiffrée avant tout détail', async () => {
    const api = new FakeApi();
    api.next = preview({
      outgoing: [
        { sku: 'A', name: 'A', priceMillicents: 1, vatRatePercent: 5.5, change: 'added' },
        { sku: 'B', name: 'B', priceMillicents: 1, vatRatePercent: 5.5, change: 'changed' },
        { sku: 'C', name: 'C', priceMillicents: 1, vatRatePercent: 5.5, change: 'unchanged' },
      ],
      removed: ['D'],
      excluded: [{ sku: 'E', reason: 'variant_sans_prix' }],
    });
    const { fixture } = await make(api);

    const figures = [...fixture.nativeElement.querySelectorAll('.figures > div')].map(
      (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(figures).toEqual(['Entrent1', 'Changent1', 'Retirés1', 'Inchangés1', 'Écartés1']);
  });

  /**
   * « Et le reste ? » se demande une fois. La liste existe, repliée : dépliée
   * d'office, quarante lignes immobiles enterreraient les trois qui bougent.
   */
  it('liste les inchangés sous leur propre section', async () => {
    const api = new FakeApi();
    api.next = preview({
      outgoing: [
        {
          sku: 'PAI-001',
          name: 'Baguette',
          priceMillicents: 1,
          vatRatePercent: 5.5,
          change: 'unchanged',
        },
      ],
    });
    const { fixture } = await make(api);

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Ce qui ne change pas');
    expect(text).toContain('1 article(s) déjà à jour');
  });

  /** Rien à envoyer n'est pas une panne : c'est la réponse la plus fréquente. */
  it('désarme l’envoi quand rien ne bouge', async () => {
    const api = new FakeApi();
    api.next = preview({
      outgoing: [
        {
          sku: 'CHO-001',
          name: 'Gros florentin lait',
          priceMillicents: 250_000,
          vatRatePercent: 5.5,
          change: 'unchanged',
        },
      ],
      removed: [],
      parity: {
        referenceCount: 1,
        mirrorCount: 1,
        missing: [],
        stale: [],
        priceGaps: [],
        vatGaps: [],
        nameGaps: [],
        inSync: true,
      },
    });
    const { buttonNamed } = await make(api);

    expect(buttonNamed('Envoyer').disabled).toBe(true);
  });

  /** Ce que la simulation ne pouvait pas voir : ce que l'envoi RETIRE. */
  it('nomme les articles que l’envoi retirerait de la vente', async () => {
    const api = new FakeApi();
    api.next = preview({ removed: ['PAI-014', 'PAI-015'] });
    const { fixture } = await make(api);

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('PAI-014');
    expect(text).toContain('PAI-015');
  });
});
