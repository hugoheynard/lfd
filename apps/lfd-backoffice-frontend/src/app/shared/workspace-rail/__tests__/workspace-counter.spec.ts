import { describe, expect, it } from 'vitest';

import { WORKSPACES } from '../workspaces';

/**
 * **L'espace « E-commerce LFC » est supprimé** (Hugo, 2026-10-17). Il n'avait
 * plus aucune vue depuis X2 : la boîte des demandes clients avait quitté son
 * rail le 2026-10-13 pour le menu principal, sous Commandes, et la réception
 * est partie avec le push. Ses anciennes adresses redirigent
 * (`b2b/b2b.routes.ts`).
 */
describe("l'espace E-commerce LFC", () => {
  it("n'est plus un espace de travail", () => {
    expect(Object.keys(WORKSPACES)).not.toContain('b2b');
  });

  it('ne laisse aucune vue de rail pointer vers une ancienne adresse /b2b', () => {
    const links = Object.values(WORKSPACES).flatMap((workspace) =>
      workspace.views.map((view) => view.link),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => link.startsWith('/b2b'))).toEqual([]);
  });
});
