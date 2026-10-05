import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FicheClientPanels } from '../informations/fiche-client.panels';

/**
 * Régression du 2026-10-05 : en corrigeant plusieurs champs de l'identité
 * légale, le panneau se fermait — une sélection de texte relâchée hors du
 * panneau envoyait le clic au fond, et Échap refermait aussi le panneau.
 */
describe('FicheClientPanels', () => {
  it('ouvre le panneau de l’identité légale sans fermeture implicite', () => {
    const opened: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        FicheClientPanels,
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (_component: unknown, config: unknown) => {
              opened.push(config);
              return { closed: Promise.resolve(undefined) };
            },
          },
        },
      ],
    });
    const company = {
      id: 'c1',
      enseigne: 'Chez Max',
      vatNumber: '',
      raisonSociale: '',
      formeJuridique: 'foreign',
      siret: '',
      siren: '',
    } as Partial<AdminCompanyDetail> as AdminCompanyDetail;

    void TestBed.inject(FicheClientPanels).openStep('legal', company);

    expect(opened).toEqual([expect.objectContaining({ disableClose: true })]);
  });
});
