import { TestBed } from '@angular/core/testing';
import type {
  DeliveryAvailabilityView,
  SiteColorsPayload,
  SiteRolesPayload,
  SiteView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryAvailabilityService } from '../../../../b2b/reglages/delivery-availability.service';
import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { gpsNotice, gpsPlace, rolesIssues, rolesOf, SiteRolesCard } from './site-roles-card';

const SITE: SiteView = {
  id: 'site_1',
  label: 'Village',
  ligne1: '1 place',
  ligne2: '',
  codePostal: '73000',
  ville: 'Val',
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  eatIn: false,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
  isDeparture: false,
};

/** Les deux routes, dans l'ordre où la carte les appelle. */
class FakeSites {
  readonly sent: SiteRolesPayload[] = [];
  readonly painted: SiteColorsPayload[] = [];
  readonly calls: string[] = [];
  refusal: unknown = null;
  colorsRefusal: unknown = null;

  setRoles(_id: string, payload: SiteRolesPayload): Promise<void> {
    this.calls.push('roles');
    this.sent.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  setColors(_id: string, payload: SiteColorsPayload): Promise<void> {
    this.calls.push('colors');
    this.painted.push(payload);
    return this.colorsRefusal === null ? Promise.resolve() : Promise.reject(this.colorsRefusal);
  }
}

/** La lecture publique de l'ouverture de la livraison, doublée. */
class FakeAvailability {
  constructor(private readonly open: { readonly b2b: boolean; readonly b2c: boolean }) {}

  readPublic(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve({
      openToB2b: this.open.b2b,
      openToB2c: this.open.b2c,
      windowMode: 'slot',
      updatedAt: null,
      updatedBy: null,
    });
  }
}

function mount(site: SiteView = SITE, readOnly = false, open = { b2b: true, b2c: true }) {
  const sites = new FakeSites();
  TestBed.configureTestingModule({
    imports: [SiteRolesCard],
    providers: [
      { provide: SitesService, useValue: sites },
      { provide: DeliveryAvailabilityService, useValue: new FakeAvailability(open) },
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
    const issues = rolesIssues({ ...rolesOf(SITE), supply: 'transfer', pickup: false });
    expect(issues.join(' ')).toContain('doit remettre des commandes');
  });

  it('refuse un site qui expédie en étant servi par transfert', () => {
    const issues = rolesIssues({ ...rolesOf(SITE), supply: 'transfer', deliveryDeparture: true });
    expect(issues.join(' ')).toContain('approvisionné sur place');
  });

  it('refuse un retrait ouvert à aucune clientèle (Hugo, 2026-10-15)', () => {
    const issues = rolesIssues({ ...rolesOf(SITE), pickupAudiences: { b2b: false, b2c: false } });
    expect(issues.join(' ')).toContain('au moins une clientèle');
  });

  it('ignore les clientèles d’un site sans retrait', () => {
    const roles = { ...rolesOf(SITE), pickup: false, pickupAudiences: { b2b: false, b2c: false } };
    expect(rolesIssues(roles)).toEqual([]);
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
    // Avec son point : un transfert sans point est refusé (Hugo, 2026-10-13).
    const located = { ...SITE, gps: { lat: 45.45, lng: 6.98 } };
    const { fixture, sites } = mount(located);
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.componentInstance['set']('transferMode', 'dedicated');

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([
      { ...rolesOf(located), supply: 'transfer', transferMode: 'dedicated' },
    ]);
    expect(saved).toBe(1);
  });

  it('n’envoie pas des rôles que le serveur refuserait', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('pickup', false);
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('doit remettre des commandes');
  });

  it('garde le refus du serveur dans la carte', async () => {
    const { fixture, sites } = mount();
    sites.refusal = { status: 409, error: { message: 'Le défaut doit remettre.' } };
    fixture.componentInstance['set']('pickup', false);

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
    expect(fixture.nativeElement.textContent).not.toContain('Enregistrer');
  });
});

const GPS = { lat: 45.45, lng: 6.98 };
const DISPATCHING: SiteView = { ...SITE, deliveryDeparture: true, gps: GPS };

describe('SiteRolesCard — le point GPS, sous « Livraison » seulement (Hugo, 2026-10-13)', () => {
  it('ne montre la saisie du point qu’une fois « Livraison » cochée', () => {
    const { fixture } = mount();
    expect(fixture.nativeElement.textContent).not.toContain('Latitude');

    fixture.componentInstance['set']('deliveryDeparture', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Latitude');
  });

  it('annonce le refus et n’envoie pas « Livraison » cochée sans point', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('deliveryDeparture', true);
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('doit avoir un point GPS');
  });

  it('envoie le point AVEC les rôles, en une écriture', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('deliveryDeparture', true);
    fixture.componentInstance['setGps']('lat', 45.45);
    fixture.componentInstance['setGps']('lng', 6.98);

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([{ ...rolesOf(SITE), deliveryDeparture: true, gps: GPS }]);
  });

  it('n’envoie pas le point quand il n’a pas changé (absent = inchangé)', async () => {
    const { fixture, sites } = mount(DISPATCHING);
    fixture.componentInstance['set']('counterSetupMinutes', 10);

    await fixture.componentInstance['save']();

    expect(sites.sent[0] && 'gps' in sites.sent[0]).toBe(false);
  });

  it('refuse d’effacer le point d’un site qui expédie', () => {
    const { fixture } = mount(DISPATCHING);
    fixture.componentInstance['setGps']('lat', null);
    fixture.componentInstance['setGps']('lng', null);

    expect(fixture.componentInstance['canSave']()).toBe(false);
  });

  it('signale sans bloquer un site qui expédiait déjà sans point', () => {
    const legacy = { ...SITE, deliveryDeparture: true };
    expect(gpsNotice(rolesOf(legacy), legacy, null)?.blocking).toBe(false);
  });
});

describe('SiteRolesCard — le retrait par clientèle (Hugo, 2026-10-15)', () => {
  it('lit un site d’avant les cases comme ouvert aux deux', () => {
    expect(rolesOf(SITE).pickupAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('envoie les cases avec les rôles quand on réserve le site aux pros', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['setPickupAudience']('b2c', false);

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([{ ...rolesOf(SITE), pickupAudiences: { b2b: true, b2c: false } }]);
  });

  it('n’envoie pas un retrait ouvert à personne, et dit pourquoi', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['setPickupAudience']('b2b', false);
    fixture.componentInstance['setPickupAudience']('b2c', false);
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('au moins une clientèle');
  });

  it('montre les deux cases sous « Retrait », et les masque sans lui', () => {
    const { fixture } = mount();
    expect(fixture.nativeElement.textContent).toContain('Retrait pour les pros');
    expect(fixture.nativeElement.textContent).toContain('Retrait pour les particuliers');

    fixture.componentInstance['set']('pickup', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Retrait pour les pros');
  });
});

describe('SiteRolesCard — l’ordre de la carte', () => {
  it('Retrait → Approvisionné → Mise en place → Livraison (+ point, + couleurs de livraison)', () => {
    const { fixture } = mount({ ...DISPATCHING });
    const text: string = fixture.nativeElement.textContent;
    const order = [
      'Couleur retrait B2B',
      'Approvisionné',
      'Mise en place au comptoir',
      'Livraison',
      'Latitude',
      'Couleur livraison B2B',
    ];
    // Chaque libellé cherché APRÈS le précédent : l'en-tête porte déjà un
    // badge « Livraison », qui n'est pas le champ.
    let from = text.indexOf('Retrait');
    for (const label of order) {
      const at = text.indexOf(label, from);
      expect(at, label).toBeGreaterThanOrEqual(from);
      from = at;
    }
  });
});

describe('SiteRolesCard — les couleurs, sous la capacité qu’elles colorent', () => {
  it('décocher « Retrait » masque ses couleurs sans les effacer', async () => {
    const { fixture, sites } = mount({ ...DISPATCHING, pickupColorB2b: '#ffcc00' });
    fixture.componentInstance['set']('pickup', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Couleur retrait B2B');
    await fixture.componentInstance['save']();
    expect(sites.painted).toEqual([]);
  });

  it('accepte un vert : couleurs libres (Hugo, 2026-10-13)', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['setColor']({ key: 'pickupColorB2c', value: '#00FF00' });

    await fixture.componentInstance['save']();

    expect(sites.painted[0]?.pickupColorB2c).toBe('#00ff00');
    expect(sites.calls).toEqual(['colors']);
  });

  it('« Aucune couleur » retire une couleur posée', async () => {
    const { fixture, sites } = mount({ ...SITE, pickupColorB2b: '#ffcc00' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aucune couleur');

    fixture.componentInstance['setColor']({ key: 'pickupColorB2b', value: null });
    await fixture.componentInstance['save']();

    expect(sites.painted[0]?.pickupColorB2b).toBeNull();
  });

  it('un bouton, deux routes, dans l’ordre : rôles puis couleurs', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('counterSetupMinutes', 10);
    fixture.componentInstance['setColor']({ key: 'pickupColorB2c', value: '#2563eb' });

    await fixture.componentInstance['save']();

    expect(sites.calls).toEqual(['roles', 'colors']);
  });

  it('dit que les rôles sont passés quand les couleurs échouent, et garde le brouillon', async () => {
    const { fixture, sites } = mount();
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => (saved += 1));
    sites.colorsRefusal = { status: 500, error: { message: 'Panne.' } };
    fixture.componentInstance['set']('counterSetupMinutes', 10);
    fixture.componentInstance['setColor']({ key: 'pickupColorB2c', value: '#2563eb' });

    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Rôles enregistrés, mais les couleurs');
    expect(fixture.componentInstance['colors']().pickupColorB2c).toBe('#2563eb');
    expect(saved).toBe(0);
  });

  it('grise la couleur livraison B2C quand la livraison aux particuliers est coupée', async () => {
    const { fixture } = mount(DISPATCHING, false, { b2b: true, b2c: false });
    await fixture.whenStable();
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Livraison aux particuliers non activée');
    expect(text).not.toContain('Livraison aux professionnels non activée');
    expect(fixture.componentInstance['closed']().deliveryColorB2c).toBeDefined();
  });

  it('laisse la couleur livraison B2C active quand la livraison aux particuliers est ouverte', async () => {
    const { fixture } = mount(DISPATCHING);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('non activée');
    expect(fixture.componentInstance['closed']()).toEqual({});
  });
});

describe('SiteRolesCard — le point GPS sous « Approvisionné par transfert » (Hugo, 2026-10-13)', () => {
  it('montre la saisie sous le transfert, et une seule', () => {
    const { fixture } = mount();
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;

    expect(text.split('Latitude')).toHaveLength(2);
    expect(text.indexOf('Latitude')).toBeLessThan(text.indexOf('Mise en place au comptoir'));
  });

  it('annonce le refus d’un transfert sans point, et n’envoie rien', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('destination du trajet');
  });

  it('envoie le point AVEC le transfert, en une écriture', async () => {
    const { fixture, sites } = mount();
    fixture.componentInstance['set']('supply', 'transfer');
    fixture.componentInstance['setGps']('lat', 45.45);
    fixture.componentInstance['setGps']('lng', 6.98);

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([{ ...rolesOf(SITE), supply: 'transfer', gps: GPS }]);
  });

  it('place la saisie sous le premier rôle qui l’exige', () => {
    expect(gpsPlace({ ...rolesOf(SITE), supply: 'transfer' })).toBe('transfer');
    expect(gpsPlace({ ...rolesOf(SITE), deliveryDeparture: true })).toBe('delivery');
    expect(gpsPlace(rolesOf(SITE))).toBeNull();
  });
});

describe('SiteRolesCard — les badges de l’en-tête', () => {
  it('reprennent les mots de la liste, sur l’état ENREGISTRÉ', () => {
    const { fixture } = mount(DISPATCHING);
    fixture.componentInstance['set']('pickup', false);
    fixture.detectChanges();
    const badges = Array.from(
      fixture.nativeElement.querySelectorAll('fold-badge') as NodeListOf<HTMLElement>,
    ).map((badge) => badge.textContent?.trim());

    expect(badges).toEqual(['Retrait', 'Livraison']);
  });
});

describe('SiteRolesCard — le départ des tournées (Hugo, 2026-10-13)', () => {
  const START: SiteView = { ...SITE, deliveryDeparture: true, gps: GPS, isDeparture: true };

  it('le signale par un badge sous « Livraison »', () => {
    const { fixture } = mount(START);
    expect(fixture.nativeElement.textContent).toContain('Départ des tournées');
  });

  it('ne le signale pas sur un autre site', () => {
    const { fixture } = mount(DISPATCHING);
    expect(fixture.nativeElement.textContent).not.toContain('Départ des tournées');
  });

  it('annonce le refus de retirer « Livraison » au départ, et n’envoie rien', async () => {
    const { fixture, sites } = mount(START);
    fixture.componentInstance['set']('deliveryDeparture', false);
    fixture.detectChanges();

    await fixture.componentInstance['save']();

    expect(sites.sent).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Livraison › Point de départ');
  });
});
