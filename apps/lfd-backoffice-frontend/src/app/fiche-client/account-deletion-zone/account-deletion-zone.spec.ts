import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SubAccountView } from '@lfd/contracts';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AccountDeletionZone, type DeletionReasonChoice } from './account-deletion-zone';

const COMPANY: AdminCompanyDetail = {
  revision: 0,
  activation: null,
  gate: { canActivate: false, blocking: [], checklist: [] },
  archivedAt: null,
  archivedByName: null,
  archiveReason: null,
  hasOrders: false,
  suspensionCause: null,
  id: 'cmp_1',
  reference: 'C-ADM001',
  raisonSociale: 'Café des Halles SAS',
  enseigne: '',
  formeJuridique: 'SAS',
  siret: '81245678900021',
  siren: '',
  vatNumber: '',
  status: 'pending',
  grantedTerms: [],
  requestedTerm: null,
  directDebitBlocked: false,
  primaryContact: {
    id: null,
    role: null,
    firstName: 'Camille',
    lastName: 'Rousseau',
    fonction: 'Gérante',
    email: 'gerant@halles.fr',
    phone: '',
  },
  kbis: null,
  owner: null,
  hasOpenSupportRequest: false,
  parent: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  declaredVia: null,
  piecesReached: [],
  chorusRouting: null,
  activatedAt: null,
  warnings: [],
  vatNumberRequired: true,
  hasBankAccount: false,
  hierarchy: {
    parent: null,
    subAccounts: [],
    follows: [],
    groupWithoutDelivery: false,
    collectionForm: null,
  },
  addresses: { billing: null, deliveries: [] },
  contacts: [],
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

const SUB_ACCOUNT: SubAccountView = {
  id: 'cmp_site',
  enseigne: 'Le site',
  city: null,
  status: 'active',
  followedAspects: [],
  follows: [],
  menuState: 'none',
  menu: null,
};

interface Rendered {
  readonly zone: AccountDeletionZone;
  readonly host: HTMLElement;
  readonly button: () => HTMLButtonElement;
  readonly emitted: string[];
  readonly choose: (choice: DeletionReasonChoice, other?: string) => void;
}

function render(company: Partial<AdminCompanyDetail> = {}): Rendered {
  const fixture = TestBed.createComponent(AccountDeletionZone);
  fixture.componentRef.setInput('company', { ...COMPANY, ...company });
  const emitted: string[] = [];
  fixture.componentInstance.archive.subscribe((reason) => emitted.push(reason));
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const zone = fixture.componentInstance;
  return {
    zone,
    host,
    button: () => {
      fixture.detectChanges();
      return host.querySelector('[data-deletion-action]') as HTMLButtonElement;
    },
    emitted,
    choose: (choice, other) => {
      zone['choice'].set(choice);
      if (other !== undefined) {
        zone['otherText'].set(other);
      }
      fixture.detectChanges();
    },
  };
}

describe('Supprimer le compte', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('reste désarmé tant que le motif n’est pas choisi', () => {
    const { button } = render();
    expect(button().disabled).toBe(true);
  });

  it('envoie le libellé du motif choisi', () => {
    const { zone, button, emitted, choose } = render();
    choose('mistake');
    expect(button().disabled).toBe(false);
    zone['confirm']();
    expect(emitted).toEqual(['Créé par erreur']);
  });

  it('« Autre » exige un texte, et c’est le texte qui part', () => {
    const { zone, button, emitted, choose } = render();
    choose('other', '   ');
    expect(button().disabled).toBe(true);
    choose('other', '  Compte de test du commercial  ');
    expect(button().disabled).toBe(false);
    zone['confirm']();
    expect(emitted).toEqual(['Compte de test du commercial']);
  });

  it('refuse un motif plus long que ce que le serveur accepte', () => {
    const { button, choose, host } = render();
    choose('other', 'x'.repeat(501));
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain('dépasse 500 caractères');
  });

  it('un compte qui a des commandes renvoie à la résiliation', () => {
    const { host, button } = render({ hasOrders: true });
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain('Ce compte a des commandes : résiliez-le plutôt.');
  });

  it('un site se détache d’abord', () => {
    const { host, button } = render({ parent: { id: 'cmp_p', enseigne: 'Principal' } });
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain('Détachez d’abord ce site.');
  });

  it('un principal qui a des sites les détache d’abord', () => {
    const { host, button } = render({
      hierarchy: { ...COMPANY.hierarchy, subAccounts: [SUB_ACCOUNT] },
    });
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain('Détachez d’abord ses sites.');
  });

  it('un compte désarmé n’émet rien, même confirmé', () => {
    const { zone, emitted, choose } = render({ hasOrders: true });
    choose('duplicate');
    zone['confirm']();
    expect(emitted).toEqual([]);
  });
});
