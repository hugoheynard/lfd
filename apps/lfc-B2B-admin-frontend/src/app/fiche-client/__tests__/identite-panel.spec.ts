import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import {
  AdminIdentitePanel,
  type AdminIdentitePanelData,
} from '../panels/identite-panel/identite-panel';

/** Une société dont il ne manque que le SIRET. */
const PARTIELLE: AdminIdentitePanelData = {
  companyId: 'cmp_1',
  enseigne: 'Le Comptoir',
  tvaIntracom: 'FR32812456789',
  raisonSociale: 'Le Comptoir SAS',
  formeJuridique: 'SAS',
  siret: '',
};

function open(data: AdminIdentitePanelData): AdminIdentitePanel {
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminCompaniesService, useValue: { updateIdentity: () => Promise.resolve() } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(AdminIdentitePanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('AdminIdentitePanel', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('préremplit TOUT ce qui est déjà enregistré', () => {
    // Régression : seules l'enseigne et la TVA étaient semées. Le commercial
    // voyait des champs vides devant des valeurs existantes, croyait n'avoir
    // rien saisi, et renvoyait du vide pour ce qui était déjà là.
    const panel = open(PARTIELLE);

    expect(panel['enseigne']()).toBe('Le Comptoir');
    expect(panel['tvaIntracom']()).toBe('FR32812456789');
    expect(panel['raisonSociale']()).toBe('Le Comptoir SAS');
    expect(panel['formeJuridique']()).toBe('SAS');
    expect(panel['siret']()).toBe('');
  });

  it("réclame les champs du greffe tant qu'il en manque un", () => {
    expect(open(PARTIELLE)['legalMissing']()).toBe(true);
  });

  it('cesse de les réclamer une fois tous posés', () => {
    // Un champ figé n'a rien à faire dans un formulaire.
    TestBed.resetTestingModule();

    expect(open({ ...PARTIELLE, siret: '81245678900021' })['legalMissing']()).toBe(false);
  });
});
