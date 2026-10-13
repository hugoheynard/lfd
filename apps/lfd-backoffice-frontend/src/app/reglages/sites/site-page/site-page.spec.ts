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
import { SitesService } from '../sites.service';
import { SitePage } from './site-page';

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
  isDefault: true,
  discount: { mode: 'amount', cents: 800 },
  discountAudiences: { b2b: true, b2c: false },
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

/** Un second site, ni défaut ni départ : c'est lui qui s'archive. */
const VILLAGE: SiteView = { ...LABO, id: 'pick_2', label: 'Village', isDefault: false };

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
  return { fixture, pickups, router: TestBed.inject(Router) };
}

/** Les cases natives des deux clientèles, B2B puis B2C. */
const audienceBoxes = (fixture: ComponentFixture<SitePage>): HTMLInputElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll('fold-fieldset fold-checkbox input'));

describe('SitePage — le chargement', () => {
  it('lit le site par sa route unitaire', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.componentInstance['draft']().label).toBe('Labo');
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
  it('montre rôles et couleurs d’un site existant', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.nativeElement.querySelector('app-site-roles-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-colors-card')).not.toBeNull();
  });

  it('masque les cartes du retrait d’un site qui ne remet pas', async () => {
    const { fixture } = await mount('pick_2', [LABO, { ...VILLAGE, handsOver: false }]);
    const text: string = fixture.nativeElement.textContent;

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

describe('SitePage — les clientèles de la réduction', () => {
  it('reprend les clientèles du point, et les renvoie à la modification', async () => {
    const { fixture, pickups } = await mount('pick_1');

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: false });
  });

  it('envoie une case changée', async () => {
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setAudience']('b2c', true);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('crée un point avec les deux clientèles par défaut — l’existant', async () => {
    const { fixture, pickups } = await mount(undefined);
    fixture.componentInstance['draft'].set(postalDraftFrom(LABO));
    fixture.componentInstance['setDiscount']({ direction: 'decrease', mode: 'amount', cents: 500 });

    await fixture.componentInstance['submit']();

    expect(pickups.created[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('grise les cases tant qu’il n’y a pas de réduction', async () => {
    const { fixture } = await mount('pick_1', [{ ...LABO, discount: null }, VILLAGE]);

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([true, true]);
  });

  it('les rend cochables dès qu’une réduction existe', async () => {
    const { fixture } = await mount('pick_1');

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([false, false]);
  });

  it('🔴 retirer la réduction ne remet pas les cases à zéro', async () => {
    // Sans réduction, le serveur ne les lit pas ; les effacer ferait perdre un
    // choix qu'on retrouverait en rouvrant la réduction.
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setDiscount'](null);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]).toMatchObject({
      discount: null,
      discountAudiences: { b2b: true, b2c: false },
    });
  });

  it('refuse d’envoyer une réduction qui ne vise personne, et le dit', async () => {
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setAudience']('b2b', false);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();

    expect(pickups.updated).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Cochez au moins une clientèle');
  });

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

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Cochez au moins une clientèle, ou retirez la réduction');
  });

  it('reste sur la page après une modification réussie', async () => {
    const { fixture, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance['submit']();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('mène à la page du site créé, où se règlent ses rôles et ses couleurs', async () => {
    const { fixture, router } = await mount(undefined);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance['draft'].set(postalDraftFrom(LABO));

    await fixture.componentInstance['submit']();

    expect(navigate).toHaveBeenCalledWith([SITES_PATH, 'pick_new']);
  });
});

/**
 * **Archiver un site** — il n'y a plus de suppression (plan des sites, §3.1).
 * Le serveur refuse le défaut et le site d'où partent les livraisons ; la zone
 * le dit plutôt que d'offrir un geste refusé.
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

  it('🔴 le site par défaut : la zone explique, et rien ne part', async () => {
    const { fixture, pickups } = await mount('pick_1');

    expect(fixture.componentInstance['deleteAction']()).toBeUndefined();
    expect(zone(fixture)?.textContent).toContain('site par défaut');

    await fixture.componentInstance['archive']();
    expect(pickups.archived).toEqual([]);
  });

  it('🔴 le site d’où partent les livraisons : la zone explique, et rien ne part', async () => {
    const { fixture, pickups } = await mount('pick_2', [LABO, { ...VILLAGE, dispatches: true }]);

    expect(zone(fixture)?.textContent).toContain('Expédie');

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

describe('SitePage — le point GPS', () => {
  it('reprend le point GPS enregistré, et le renvoie à la modification', async () => {
    const { fixture, pickups } = await mount('pick_1', [
      { ...LABO, gps: { lat: 48.85, lng: 2.37 } },
      VILLAGE,
    ]);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.gps).toEqual({ lat: 48.85, lng: 2.37 });
  });

  it('un point sans GPS envoie `null`, jamais un point inventé', async () => {
    const { fixture, pickups } = await mount('pick_1');

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.gps).toBeNull();
  });

  it('refuse d’envoyer une latitude sans longitude, et le dit', async () => {
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setGps']('lat', 48.85);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();

    expect(pickups.updated).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ET la longitude');
  });
});
