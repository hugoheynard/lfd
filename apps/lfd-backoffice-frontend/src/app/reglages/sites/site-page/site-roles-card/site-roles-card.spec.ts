import { TestBed } from '@angular/core/testing';
import type { SiteRolesPayload, SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { rolesIssues, rolesOf, SiteRolesCard } from './site-roles-card';

const SITE: SiteView = {
  id: 'site_1',
  label: 'Village',
  ligne1: '1 place',
  ligne2: '',
  codePostal: '73000',
  ville: 'Val',
  pays: 'France',
  isDefault: false,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  handsOver: true,
  supply: 'on_site',
  dispatches: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
};

class FakeSites {
  readonly sent: SiteRolesPayload[] = [];
  refusal: unknown = null;

  setRoles(_id: string, payload: SiteRolesPayload): Promise<void> {
    this.sent.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

function mount(site: SiteView = SITE, readOnly = false) {
  const sites = new FakeSites();
  TestBed.configureTestingModule({
    imports: [SiteRolesCard],
    providers: [
      { provide: SitesService, useValue: sites },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SiteRolesCard);
  fixture.componentRef.setInput('site', site);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  return { fixture, sites };
}

describe('rolesIssues — les refus du serveur, dits avant l’envoi', () => {
  it('ne dit rien de rôles cohérents', () => {
    expect(rolesIssues(rolesOf(SITE))).toEqual([]);
  });

  it('refuse un site servi par transfert qui ne remet pas', () => {
    const issues = rolesIssues({ ...rolesOf(SITE), supply: 'transfer', handsOver: false });
    expect(issues.join(' ')).toContain('doit remettre des commandes');
  });

  it('refuse un site qui expédie en étant servi par transfert', () => {
    const issues = rolesIssues({ ...rolesOf(SITE), supply: 'transfer', dispatches: true });
    expect(issues.join(' ')).toContain('approvisionné sur place');
  });

  it('refuse une mise en place négative', () => {
    expect(rolesIssues({ ...rolesOf(SITE), counterSetupMinutes: -5 })).toHaveLength(1);
  });
});

describe('SiteRolesCard', () => {
  it('n’offre rien à enregistrer tant que rien ne change', () => {
    const { fixture } = mount();
    expect(fixture.componentInstance['canSave']()).toBe(false);
  });

  it('envoie les rôles EN BLOC, et annonce l’enregistrement', async () => {
    const { fixture, sites } = mount();
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.componentInstance['set']('transferMode', 'dedicated');

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([
      { ...rolesOf(SITE), supply: 'transfer', transferMode: 'dedicated' },
    ]);
    expect(saved).toBe(1);
  });

  it('n’envoie pas des rôles que le serveur refuserait', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('handsOver', false);
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('doit remettre des commandes');
  });

  it('garde le refus du serveur dans la carte', async () => {
    const { fixture, sites } = mount();
    sites.refusal = { status: 409, error: { message: 'Le défaut doit remettre.' } };
    fixture.componentInstance['set']('handsOver', false);

    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Le défaut doit remettre.');
  });

  it('montre le mode de transfert seulement avec le transfert', () => {
    const { fixture } = mount();
    expect(fixture.nativeElement.textContent).not.toContain('Intégré à une tournée');

    fixture.componentInstance['set']('supply', 'transfer');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('fold-listbox')).toHaveLength(2);
  });

  it('en lecture seule, n’offre pas d’enregistrer', () => {
    const { fixture } = mount(SITE, true);
    expect(fixture.nativeElement.textContent).not.toContain('Enregistrer les rôles');
  });
});
