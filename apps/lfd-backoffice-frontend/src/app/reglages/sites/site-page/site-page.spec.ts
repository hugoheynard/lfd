import { By } from '@angular/platform-browser';
import { DEFAULT_DELIVERY_AVAILABILITY } from '@lfd/contracts';
import { DeliveryAvailabilityService } from '../../../b2b/reglages/delivery-availability.service';
import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type {
  PickupAddressPayload,
  PickupAddressUpdatePayload,
  PublicPickupScheduleView,
  SiteColorsPayload,
  SiteRolesPayload,
  SiteView,
} from '@lfd/contracts';
import { postalDraftFrom } from '@lfd/b2b-ui/company';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { SITES_PATH } from '../sites-path';
import { AudienceDiscountCard } from './audience-discount-card/audience-discount-card';
import { SiteDiscountCard } from './site-discount-card/site-discount-card';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { SiteHoursCard } from './site-hours-card/site-hours-card';
import { SiteIdentityCard } from './site-identity-card/site-identity-card';
import { SitesService } from '../sites.service';
import { SitePage } from './site-page';

/** 8 € pour une clientèle, sans règle de portée. */
const EIGHT_EUROS = {
  adjustment: { mode: 'amount', cents: 800 },
  scope: 'all_except',
  categories: [],
  products: [],
} as const;

/**
 * **Un site, en page** — l'ancienne page du point de retrait, élargie (plan
 * des sites, S1). Les cas du point restent (clientèles de la réduction, GPS,
 * refus sur la page) ; ce qui change : la lecture unitaire `admin/sites/:id`,
 * l'archivage à la place de la suppression, et les cartes du retrait masquées
 * à un site qui ne remet pas.
 */

const LABO: SiteView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  discounts: { b2b: EIGHT_EUROS, b2c: null },
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
  resupplyColor: null,
  archivedAt: null,
  isDeparture: false,
};

/** Un second site, qui ne livre pas : c'est lui qui s'archive. */
const VILLAGE: SiteView = { ...LABO, id: 'pick_2', label: 'Village' };

const NO_SCHEDULE: PublicPickupScheduleView = { rules: [], closures: [] };

class FakeSites {
  readonly created: PickupAddressPayload[] = [];
  readonly updated: PickupAddressUpdatePayload[] = [];
  readonly archived: string[] = [];
  readonly roles: SiteRolesPayload[] = [];
  readonly colors: SiteColorsPayload[] = [];
  refusal: unknown = null;

  constructor(private readonly sites: readonly SiteView[]) {}

  get(id: string): Promise<SiteView> {
    const site = this.sites.find((candidate) => candidate.id === id);
    return site === undefined
      ? Promise.reject(new HttpErrorResponse({ status: 404 }))
      : Promise.resolve(site);
  }

  create(payload: PickupAddressPayload): Promise<{ id: string }> {
    this.created.push(payload);
    return this.refusal === null
      ? Promise.resolve({ id: 'pick_new' })
      : Promise.reject(this.refusal);
  }

  update(_id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    this.updated.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  setRoles(_id: string, payload: SiteRolesPayload): Promise<void> {
    this.roles.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  setColors(_id: string, payload: SiteColorsPayload): Promise<void> {
    this.colors.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  archive(id: string): Promise<void> {
    this.archived.push(id);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  publicSchedule(): Promise<PublicPickupScheduleView> {
    return Promise.resolve(NO_SCHEDULE);
  }
}

interface Harness {
  readonly fixture: ComponentFixture<SitePage>;
  readonly pickups: FakeSites;
  readonly router: Router;
}

/** Monte la page. `id` absent = création. */
async function mount(
  id: string | undefined,
  sites: readonly SiteView[] = [LABO, VILLAGE],
): Promise<Harness> {
  const pickups = new FakeSites(sites);
  TestBed.configureTestingModule({
    imports: [SitePage],
    providers: [
      provideRouter([]),
      { provide: SitesService, useValue: pickups },
      {
        provide: CatalogueService,
        useValue: {
          published: () => Promise.resolve({ shelves: [], entries: [], pendingReview: [] }),
        },
      },
      // La carte des couleurs lit l'ouverture de la livraison (route publique).
      {
        provide: DeliveryAvailabilityService,
        useValue: { readPublic: () => Promise.resolve(DEFAULT_DELIVERY_AVAILABILITY) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SitePage);
  if (id !== undefined) {
    fixture.componentRef.setInput('id', id);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  // La carte des réductions lit le catalogue publié après l'arrivée du site.
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, pickups, router: TestBed.inject(Router) };
}

describe('SitePage — le chargement', () => {
  it('lit le site par sa route unitaire', async () => {
    const { fixture } = await mount('pick_1');

    expect(identity(fixture)['draft']().label).toBe('Labo');
    expect(fixture.componentInstance['heading']()).toBe('Labo');
  });

  it('dit qu’un identifiant inconnu ne désigne rien, plutôt que d’inventer', async () => {
    const { fixture } = await mount('pick_absent');

    expect(fixture.componentInstance['notFound']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Site introuvable');
  });

  it('sans identifiant, c’est une création : rien à charger', async () => {
    const { fixture } = await mount(undefined);

    expect(fixture.componentInstance['isCreate']()).toBe(true);
    expect(fixture.componentInstance['loading']()).toBe(false);
    expect(fixture.componentInstance['heading']()).toBe('Nouveau site');
  });

  it('dit un échec de lecture autre qu’un 404 par un état d’erreur fold, sans « introuvable »', async () => {
    const { fixture, pickups } = await mount(undefined);
    vi.spyOn(pickups, 'get').mockRejectedValue(new HttpErrorResponse({ status: 500 }));

    await fixture.componentInstance['load']('pick_1');
    fixture.detectChanges();

    expect(fixture.componentInstance['loadFailed']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Impossible de charger le site');
  });
});

describe('SitePage — les cartes selon les rôles', () => {
  it('montre la carte des rôles — couleurs comprises — d’un site existant', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.nativeElement.querySelector('app-site-roles-card')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Enregistrer les couleurs');
  });

  it('réunit le retrait en UNE carte à trois sous-cartes (Hugo, 2026-10-13)', async () => {
    const { fixture } = await mount('pick_1');
    const root: HTMLElement = fixture.nativeElement;
    const text = root.textContent ?? '';
    const order = [
      'Paramétrage du retrait',
      'Heures de retrait',
      'Créneaux publics de retrait',
      'Réductions de retrait sur ce site',
    ].map((label) => text.indexOf(label));

    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(root.querySelectorAll('fold-card[surface="sunken"]').length).toBeGreaterThanOrEqual(3);
  });

  it('masque les cartes du retrait d’un site qui ne remet pas', async () => {
    const { fixture } = await mount('pick_2', [LABO, { ...VILLAGE, pickup: false }]);
    const text: string = fixture.nativeElement.textContent;

    expect(text).not.toContain('Paramétrage du retrait');
    expect(text).not.toContain('Réduction de retrait');
    expect(text).not.toContain('Heures de retrait');
    expect(fixture.nativeElement.querySelector('app-public-slots-card')).toBeNull();
  });

  it('🔴 fige un site archivé : ni Enregistrer, ni zone d’archivage', async () => {
    const { fixture } = await mount('pick_2', [
      LABO,
      { ...VILLAGE, archivedAt: '2026-10-13T08:00:00.000Z' },
    ]);
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Ce site est archivé');
    expect(text).not.toContain('Enregistrer');
    expect(fixture.nativeElement.querySelector('fold-danger-zone')).toBeNull();
  });
});

/** La carte d'identité, montée par la page : elle porte l'adresse et sa sauvegarde. */
function identity(fixture: ComponentFixture<SitePage>): SiteIdentityCard {
  return fixture.debugElement.query(By.directive(SiteIdentityCard)).componentInstance;
}

/** La carte d'une clientèle, montée par la page : Pros, puis Particuliers. */
function audienceCard(fixture: ComponentFixture<SitePage>, index: number): AudienceDiscountCard {
  return fixture.debugElement.queryAll(By.directive(AudienceDiscountCard))[index]
    ?.componentInstance;
}

/**
 * Chaque clientèle a SA réduction et SA sauvegarde (lot B du plan des
 * exclusions) : ses cas vivent dans `AudienceDiscountCard`, la page vérifie
 * le branchement.
 */
describe('SitePage — les réductions, une carte par clientèle', () => {
  it('enregistrer l’adresse n’envoie pas les remises, même modifiées', async () => {
    const { fixture, pickups } = await mount('pick_1');
    audienceCard(fixture, 1)['setDiscount']({ mode: 'percent', bp: 500, direction: 'decrease' });
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));

    await identity(fixture)['save']();

    expect(pickups.updated[0]?.label).toBe('Laboratoire bis');
    expect(pickups.updated[0] && 'discounts' in pickups.updated[0]).toBe(false);
  });

  it('montre deux cartes, Pros puis Particuliers', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.debugElement.queryAll(By.directive(AudienceDiscountCard))).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Particuliers');
  });

  it('retirer la réduction des pros n’enregistre qu’elle, sur le lieu ENREGISTRÉ', async () => {
    const { fixture, pickups } = await mount('pick_1');
    identity(fixture)['draft'].update((d) => ({ ...d, ligne1: 'brouillon de la page' }));
    const card = audienceCard(fixture, 0);
    card['setDiscount'](null);

    await card['save']();

    expect(pickups.updated).toHaveLength(1);
    expect(pickups.updated[0]).toMatchObject({
      ligne1: LABO.ligne1,
      discounts: { b2b: null, b2c: null },
    });
    expect(pickups.updated[0] && 'gps' in pickups.updated[0]).toBe(false);
  });

  it('crée un site sans réduction : elle se règle une fois qu’il existe', async () => {
    const { fixture, pickups, router } = await mount(undefined);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    identity(fixture)['draft'].set(postalDraftFrom(LABO));

    await identity(fixture)['save']();

    expect(pickups.created[0]).toMatchObject({ discounts: { b2b: null, b2c: null } });
    expect(fixture.debugElement.query(By.directive(SiteDiscountCard))).toBeNull();
  });
});

describe('SitePage — les refus', () => {
  it('🔴 garde le refus du serveur SUR LA PAGE, sans naviguer', async () => {
    const { fixture, pickups, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    pickups.refusal = {
      status: 400,
      error: {
        code: 'validation',
        message: 'Cochez au moins une clientèle, ou retirez la réduction',
      },
    };
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));

    await identity(fixture)['save']();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Cochez au moins une clientèle, ou retirez la réduction');
  });

  it('reste sur la page après une modification réussie', async () => {
    const { fixture, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));

    await identity(fixture)['save']();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('mène à la page du site créé, où se règlent ses rôles et ses couleurs', async () => {
    const { fixture, router } = await mount(undefined);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    identity(fixture)['draft'].set(postalDraftFrom(LABO));

    await identity(fixture)['save']();

    expect(navigate).toHaveBeenCalledWith([SITES_PATH, 'pick_new']);
  });
});

/**
 * **Archiver un site** — il n'y a plus de suppression (plan des sites, §3.1).
 * Le serveur refuse le site d'où partent les livraisons ; la zone le dit plutôt
 * que d'offrir un geste refusé. Le refus du « site par défaut » est parti avec
 * lui (Hugo, 2026-10-15).
 */
describe('SitePage — la zone dangereuse', () => {
  const zone = (fixture: ComponentFixture<SitePage>): HTMLElement | null =>
    fixture.nativeElement.querySelector('fold-danger-zone');

  it('n’existe pas à la création : il n’y a rien à archiver', async () => {
    const { fixture } = await mount(undefined);

    expect(zone(fixture)).toBeNull();
  });

  it('fait taper le nom du site pour archiver', async () => {
    const { fixture } = await mount('pick_2');

    expect(fixture.componentInstance['deleteAction']()).toBe('Archiver ce site');
    expect(fixture.componentInstance['confirmPhrase']()).toBe('Village');
  });

  it('un site sans nom se confirme par sa ville', async () => {
    const { fixture } = await mount('pick_2', [LABO, { ...VILLAGE, label: '' }]);

    expect(fixture.componentInstance['confirmPhrase']()).toBe('Paris');
  });

  it('archive, puis revient à la liste', async () => {
    const { fixture, pickups, router } = await mount('pick_2');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance['archive']();

    expect(pickups.archived).toEqual(['pick_2']);
    expect(navigate).toHaveBeenCalledWith([SITES_PATH]);
  });

  it('le premier site créé s’archive comme un autre : il n’y a plus de défaut', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.componentInstance['deleteAction']()).toBe('Archiver ce site');
    expect(zone(fixture)?.textContent).not.toContain('par défaut');
  });

  it('n’affiche plus de badge ni de case « par défaut »', async () => {
    const { fixture } = await mount('pick_1');
    const text: string = fixture.nativeElement.textContent;

    expect(text).not.toContain('Par défaut');
    expect(text).not.toContain('Site par défaut');
  });

  it('🔴 le site d’où partent les livraisons : la zone explique, et rien ne part', async () => {
    const { fixture, pickups } = await mount('pick_2', [
      LABO,
      { ...VILLAGE, deliveryDeparture: true },
    ]);

    expect(zone(fixture)?.textContent).toContain('Livraison');

    await fixture.componentInstance['archive']();
    expect(pickups.archived).toEqual([]);
  });

  it('un refus reste sur la page, sans naviguer', async () => {
    const { fixture, pickups, router } = await mount('pick_2');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    pickups.refusal = { status: 409, error: { message: 'Site encore utilisé.' } };

    await fixture.componentInstance['archive']();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Site encore utilisé.');
  });
});

/**
 * Le point GPS se saisit SOUS « Livraison », dans la carte des rôles, et nulle
 * part ailleurs (Hugo, 2026-10-13) : la page ne l'envoie plus, ce qui le
 * laisse inchangé côté serveur (absent = inchangé).
 */
describe('SitePage — le point GPS n’est plus saisi ici', () => {
  it('n’envoie pas de `gps` avec le lieu, et n’en montre pas la saisie', async () => {
    const { fixture, pickups } = await mount('pick_1', [
      { ...LABO, gps: { lat: 48.85, lng: 2.37 } },
      VILLAGE,
    ]);
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));

    await identity(fixture)['save']();

    expect(pickups.updated[0]).toBeDefined();
    expect(pickups.updated[0] && 'gps' in pickups.updated[0]).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Latitude');
  });
});

/**
 * Chaque carte enregistre ce qu'elle montre (Hugo, 2026-10-13) : plus
 * d'« Enregistrer » dans l'en-tête d'un site existant, et une seule route
 * (`PATCH` du lieu) qui reçoit l'état ENREGISTRÉ pour tout le reste.
 */
describe('SitePage — un enregistrement par carte', () => {
  it('n’offre aucun « Enregistrer » dans l’en-tête d’un site existant', async () => {
    const { fixture } = await mount('pick_1');
    const header: HTMLElement | null = fixture.nativeElement.querySelector('[pageActions]');

    expect(header).toBeNull();
  });

  it('garde un seul « Ajouter » à la création, dans la carte d’identité', async () => {
    const { fixture } = await mount(undefined);
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map((button) => (button.textContent ?? '').trim());

    expect(fixture.nativeElement.querySelector('[pageActions]')).toBeNull();
    expect(labels.filter((label) => label === 'Ajouter')).toHaveLength(1);
    expect(labels).not.toContain('Enregistrer');
  });

  it('enregistrer les heures n’écrit qu’elles, sur l’adresse ENREGISTRÉE', async () => {
    const { fixture, pickups } = await mount('pick_1');
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));
    const hours: SiteHoursCard = fixture.debugElement.query(
      By.directive(SiteHoursCard),
    ).componentInstance;
    hours['opening'].update((entries) =>
      entries.map((entry, index) =>
        index === 0 ? { ...entry, range: { start: '07:00', end: '09:00' } } : entry,
      ),
    );

    await hours['save']();

    expect(pickups.updated).toHaveLength(1);
    expect(pickups.updated[0]?.label).toBe(LABO.label);
    expect(pickups.updated[0]?.opening.proPickup).toEqual({ start: '07:00', end: '09:00' });
  });

  it('enregistrer l’adresse n’écrit pas les heures en cours de saisie', async () => {
    const { fixture, pickups } = await mount('pick_1');
    const hours: SiteHoursCard = fixture.debugElement.query(
      By.directive(SiteHoursCard),
    ).componentInstance;
    hours['opening'].update((entries) =>
      entries.map((entry, index) =>
        index === 0 ? { ...entry, range: { start: '07:00', end: '09:00' } } : entry,
      ),
    );
    identity(fixture)['draft'].update((d) => ({ ...d, label: 'Laboratoire bis' }));

    await identity(fixture)['save']();

    expect(pickups.updated[0]?.label).toBe('Laboratoire bis');
    expect(pickups.updated[0]?.opening).toEqual(LABO.opening);
  });
});
