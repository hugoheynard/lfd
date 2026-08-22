import { describe, expect, it } from 'vitest';

import { ListLoadState } from '../list-load-state';

describe('ListLoadState', () => {
  it('ne signale rien quand la lecture aboutit', async () => {
    const state = new ListLoadState();
    const applied: number[][] = [];

    await state.run(
      () => Promise.resolve([1, 2]),
      (v) => applied.push(v),
    );

    expect(state.error()).toBeNull();
    expect(applied).toEqual([[1, 2]]);
  });

  it('retient la RAISON du refus, et relance', async () => {
    // Relancer compte : une mutation qui recharge derrière elle doit continuer
    // de voir le refus. Seul le chargement du démarrage l'absorbe.
    const state = new ListLoadState();
    const refus = { status: 500, error: { message: 'Le référentiel a refusé.' } };

    await expect(
      state.run(
        () => Promise.reject(refus),
        () => undefined,
      ),
    ).rejects.toBe(refus);

    expect(state.error()).toContain('Le référentiel a refusé.');
  });

  it('dit « injoignable » quand le backend ne répond pas du tout', async () => {
    // LE cas de la matinée : le backend n'est pas lancé. `status: 0` n'a pas de
    // corps à citer, et « une erreur est survenue » n'aiderait personne.
    const state = new ListLoadState();

    await state
      .run(
        () => Promise.reject({ status: 0 }),
        () => undefined,
      )
      .catch(() => undefined);

    expect(state.error()).toMatch(/injoignable/i);
  });

  it("efface la raison dès qu'une lecture aboutit de nouveau", async () => {
    const state = new ListLoadState();
    await state
      .run(
        () => Promise.reject(new Error('x')),
        () => undefined,
      )
      .catch(() => undefined);
    expect(state.error()).not.toBeNull();

    await state.run(
      () => Promise.resolve([]),
      () => undefined,
    );

    expect(state.error()).toBeNull();
  });

  it("n'applique RIEN quand la lecture échoue — la liste garde son état", async () => {
    const state = new ListLoadState();
    let applied = false;

    await state
      .run(
        () => Promise.reject(new Error('x')),
        () => {
          applied = true;
        },
      )
      .catch(() => undefined);

    expect(applied).toBe(false);
  });
});
