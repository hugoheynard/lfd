import { type ComponentFixture, TestBed } from '@angular/core/testing';
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

/** Un compte ouvert à l'enseigne seule : aucun papier. */
const SANS_PAPIERS: AdminIdentitePanelData = {
  companyId: 'cmp_2',
  enseigne: 'Le Comptoir',
  tvaIntracom: '',
  raisonSociale: '',
  formeJuridique: '',
  siret: '',
};

function mount(data: AdminIdentitePanelData): ComponentFixture<AdminIdentitePanel> {
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
  return fixture;
}

function open(data: AdminIdentitePanelData): AdminIdentitePanel {
  return mount(data).componentInstance;
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

    expect(panel['draft']()).toEqual({
      enseigne: 'Le Comptoir',
      tvaIntracom: 'FR32812456789',
      raisonSociale: 'Le Comptoir SAS',
      formeJuridique: 'SAS',
      siret: '',
    });
  });

  it("avertit tant qu'un champ du greffe manque", () => {
    expect(open(PARTIELLE)['legalMissing']()).toBe(true);
  });

  it('se tait une fois tous posés', () => {
    TestBed.resetTestingModule();

    expect(open({ ...PARTIELLE, siret: '81245678900021' })['legalMissing']()).toBe(false);
  });

  it('ne fait pas reposer la TVA sur une forme juridique non choisie', () => {
    // Le défaut « TVA requise » est prudent et reste juste ; c'est la PHRASE
    // qui mentait — elle nommait une forme juridique que l'écran d'à côté
    // déclarait manquante.
    const text = (mount(SANS_PAPIERS).nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('obligatoire pour cette forme juridique');
    expect(text).toContain('selon la forme juridique');
  });
});
