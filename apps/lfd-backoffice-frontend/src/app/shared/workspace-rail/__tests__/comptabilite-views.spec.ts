import { describe, expect, it } from 'vitest';

import { COMPTABILITE_VIEWS, WORKSPACES } from '../workspaces';

/**
 * **« Prélèvement du mois » est retiré** (Hugo, 2026-10-24) : la procédure de
 * prélèvement en a repris les factures de la période, les bons à constater,
 * l'aperçu et les retours. Son adresse est dégagée sans renvoi ; aucune
 * entrée — rail, onglets, tuiles du lanceur, tous lus de la même liste — ne
 * doit y mener.
 */
describe('les vues de la comptabilité', () => {
  it('ne proposent plus « Prélèvement du mois »', () => {
    const links = Object.values(WORKSPACES).flatMap((workspace) =>
      workspace.views.map((view) => view.link),
    );
    expect(links).not.toContain('/comptabilite/prelevement-du-mois');
    expect(COMPTABILITE_VIEWS.map((view) => view.key)).not.toContain('prelevement-du-mois');
  });

  it('gardent la procédure de prélèvement, sous la lecture comptable', () => {
    expect(COMPTABILITE_VIEWS.find((view) => view.key === 'procedure-de-prelevement')).toEqual(
      expect.objectContaining({
        link: '/comptabilite/procedure-de-prelevement',
        needs: 'b2b_accounting:read',
      }),
    );
  });
});
