import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { CustomerLookupView, PickupAddressView, PlatformSettings } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { PlatformSettingsService } from '../../reglages/platform-settings.service';
import { InformationsPage } from '../informations/informations-page';

/** Le débounce de la reconnaissance, tel que la page le tient. */
const LOOKUP_DEBOUNCE_MS = 400;

/** Toutes les pièces exigées : le cas le plus bavard pour la synthèse. */
const SETTINGS: PlatformSettings = {
  tva: 'required',
  kbis: 'required',
  billing: 'required',
  delivery: 'required',
};

const CREATED: CompanyOpened = {
  id: 'cmp_1',
  accessOpened: true,
  attachedToExisting: false,
  mailSent: true,
};

interface Harness {
  readonly page: InformationsPage;
  readonly create: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly errors: unknown[];
}

/**
 * Monte la page **sans identifiant de route** — c'est ce qui la met en mode
 * ouverture, exactement comme la route `/comptes-clients/nouveau`.
 */
async function setup(
  create = vi.fn(() => Promise.resolve(CREATED)),
  findCustomerByEmail: () => Promise<CustomerLookupView | null> = () => Promise.resolve(null),
): Promise<Harness> {
  const errors: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AdminCompaniesService,
        useValue: {
          create,
          findCustomerByEmail,
        } satisfies Pick<AdminCompaniesService, 'create' | 'findCustomerByEmail'>,
      },
      {
        provide: PlatformSettingsService,
        useValue: {
          get: (): Promise<PlatformSettings> => Promise.resolve(SETTINGS),
        } satisfies Pick<PlatformSettingsService, 'get'>,
      },
      {
        provide: PickupAddressesService,
        useValue: {
          list: (): Promise<readonly PickupAddressView[]> => Promise.resolve([]),
        } satisfies Pick<PickupAddressesService, 'list'>,
      },
      {
        provide: NotifyService,
        useValue: {
          success: (): void => undefined,
          info: (): void => undefined,
          error: (error: unknown): void => {
            errors.push(error);
          },
        } satisfies Pick<NotifyService, 'success' | 'info' | 'error'>,
      },
    ],
  });
  const page = TestBed.createComponent(InformationsPage).componentInstance;
  const navigate = vi.fn(() => Promise.resolve(true));
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  await Promise.resolve();
  await Promise.resolve();
  return { page, create, navigate, errors };
}

/** Remplit le bloc d'ouverture avec le minimum exigé. */
function fill(page: InformationsPage): void {
  page['identityDraft'].set({
    raisonSociale: '  La Folie Douce  ',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: '',
  });
  page['contactDraft'].set({
    firstName: 'Jean',
    lastName: 'Dupont',
    fonction: '',
    email: ' jean@exemple.fr ',
    phone: '',
  });
}

describe('InformationsPage — ouverture d’un compte', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    // La reconnaissance est débouncée : sans horloge fictive, chaque test
    // attendrait 400 ms de vrai temps pour observer une requête.
    vi.useFakeTimers();
  });

  it("ne conclut pas à « introuvable » quand il n'y a pas d'identifiant", async () => {
    const { page } = await setup();
    // L'absence d'id est ATTENDUE ici : c'est un compte qu'on ouvre, pas un
    // compte manquant.
    expect(page['draft']()).toBe(true);
    expect(page['state']()).toBe('ready');
  });

  it('montre la synthèse COMPLÈTE, comme sur une fiche où rien n’est fait', async () => {
    const { page } = await setup();
    expect(page['libSteps']().map((step) => step.key)).toEqual([
      'tva',
      'kbis',
      'billing',
      'delivery',
      'payment',
    ]);
    // Rien n'est réuni : le compte ne peut pas être activé.
    expect(page['ready']()).toBe(false);
    expect(page['canActivate']()).toBe(false);
  });

  it("n'ouvre rien tant que l'identité et le contact ne sont pas là", async () => {
    const { page } = await setup();
    expect(page['canCreate']()).toBe(false);

    // L'identité seule ne suffit pas : sans interlocuteur, personne à rappeler.
    page['identityDraft'].set({
      raisonSociale: 'La Folie Douce',
      enseigne: '',
      formeJuridique: 'SAS',
      siret: '12345678901234',
      tvaIntracom: '',
    });
    expect(page['canCreate']()).toBe(false);
  });

  it('ouvre le compte, rogne la saisie, et enchaîne sur sa fiche', async () => {
    const { page, create, navigate } = await setup();
    fill(page);
    await page['createAccount']();

    expect(create).toHaveBeenCalledWith({
      identity: {
        raisonSociale: 'La Folie Douce',
        enseigne: '',
        formeJuridique: 'SAS',
        siret: '12345678901234',
        tvaIntracom: '',
      },
      contact: {
        firstName: 'Jean',
        lastName: 'Dupont',
        fonction: '',
        email: 'jean@exemple.fr',
        phone: '',
      },
    });
    expect(navigate).toHaveBeenCalledWith(['/comptes-clients', 'cmp_1', 'informations'], {
      replaceUrl: true,
    });
  });

  it('reconnaît un client déjà connu et NOMME ses sociétés', async () => {
    // Le second établissement d'un restaurateur. Le commercial doit l'apprendre
    // pendant qu'il a le client au téléphone, pas après lui avoir annoncé un
    // nouvel espace.
    const known: CustomerLookupView = {
      userId: 'user_1',
      email: 'jean@exemple.fr',
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '',
      status: 'active',
      companies: [
        { id: 'cmp_a', raisonSociale: 'Le Comptoir' },
        { id: 'cmp_b', raisonSociale: 'La Cave' },
      ],
    };
    const { page } = await setup(undefined, () => Promise.resolve(known));

    fill(page);
    await vi.advanceTimersByTimeAsync(LOOKUP_DEBOUNCE_MS);

    expect(page['knownCustomer']()).toEqual(known);
    expect(page['knownCompanyNames']()).toBe('Le Comptoir, La Cave');
  });

  it('reste muette quand la reconnaissance échoue', async () => {
    // Cette lecture est une commodité, pas la saisie : un toast d'erreur ferait
    // croire à une panne alors que l'enregistrement, lui, marchera.
    const { page, errors } = await setup(undefined, () =>
      Promise.reject(new Error('service indisponible')),
    );

    fill(page);
    await vi.advanceTimersByTimeAsync(LOOKUP_DEBOUNCE_MS);

    expect(page['knownCustomer']()).toBeNull();
    expect(errors).toEqual([]);
  });

  it('garde la saisie à l’écran quand l’ouverture échoue', async () => {
    const boom = new Error('SIRET déjà connu');
    const { page, navigate, errors } = await setup(vi.fn(() => Promise.reject(boom)));
    fill(page);
    await page['createAccount']();

    expect(errors).toEqual([boom]);
    expect(navigate).not.toHaveBeenCalled();
    // Refaire la saisie après un refus serait une punition pour une erreur qui
    // n'est pas celle du commercial.
    expect(page['identityDraft']().raisonSociale).toBe('  La Folie Douce  ');
    expect(page['creating']()).toBe(false);
  });
});
