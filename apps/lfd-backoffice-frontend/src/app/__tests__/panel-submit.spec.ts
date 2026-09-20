import { Injector, runInInjectionContext } from '@angular/core';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';
import { LFD_NOTIFY, panelSubmit, type LfdNotify, type PanelSubmit } from '@lfd/b2b-ui/panel';

/**
 * Ce que la chorégraphie d'enregistrement promet — et que chacun des deux
 * panneaux d'adresse tenait à moitié avant qu'elle n'existe : garder le
 * double-clic, dire ce qui a échoué, et ne fermer que sur un succès.
 *
 * Le code testé vit dans `@lfd/b2b-ui/panel` ; le test vit ICI parce que le
 * runner de la lib est volontairement pur — CJS, sans Angular ni `fold-ng`,
 * qui sont ESM. Ce qui touche à l'injection se vérifie donc chez un
 * consommateur, où le compilateur Angular tourne pour de vrai.
 */
interface Harness {
  readonly submit: PanelSubmit;
  readonly closed: (boolean | undefined)[];
  readonly successes: string[];
  readonly failures: unknown[];
}

function harness(): Harness {
  const closed: (boolean | undefined)[] = [];
  const successes: string[] = [];
  const failures: unknown[] = [];
  const notify: LfdNotify = {
    success: (message) => successes.push(message),
    error: (error) => failures.push(error),
  };
  const ref = new FoldPanelRef<boolean>(1, (result) => closed.push(result));
  const injector = Injector.create({
    providers: [
      { provide: FoldPanelRef, useValue: ref },
      { provide: LFD_NOTIFY, useValue: notify },
    ],
  });
  return {
    submit: runInInjectionContext(injector, panelSubmit),
    closed,
    successes,
    failures,
  };
}

describe('panelSubmit', () => {
  it('annonce et ferme avec un résultat VRAI quand ça a marché', async () => {
    const { submit, closed, successes } = harness();

    await expect(submit.run(async () => undefined, 'Adresse enregistrée.')).resolves.toBe(true);

    expect(successes).toEqual(['Adresse enregistrée.']);
    expect(closed).toEqual([true]);
    expect(submit.pending()).toBe(false);
  });

  it('laisse le panneau OUVERT quand ça a échoué, et le dit', async () => {
    const { submit, closed, failures, successes } = harness();
    const boom = new Error('409');

    await expect(submit.run(() => Promise.reject(boom), 'Adresse enregistrée.')).resolves.toBe(
      false,
    );

    // La saisie est encore là : la corriger vaut mieux que la retaper.
    expect(closed).toEqual([]);
    expect(successes).toEqual([]);
    expect(failures).toEqual([boom]);
    expect(submit.pending()).toBe(false);
  });

  it('ignore le second clic tant que le premier est en vol', async () => {
    const { submit, closed } = harness();
    let calls = 0;
    const work = async (): Promise<void> => {
      calls += 1;
      await Promise.resolve();
    };

    const first = submit.run(work, 'Enregistré.');
    const second = submit.run(work, 'Enregistré.');

    expect(submit.pending()).toBe(true);
    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
    expect(calls).toBe(1);
    // Une seule fermeture : deux clics ne créent pas deux adresses.
    expect(closed).toEqual([true]);
  });
});
