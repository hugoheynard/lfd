import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { DeliveryAvailabilityService } from '../../b2b/reglages/delivery-availability.service';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { InformationsPage } from '../informations/informations-page';

/** Toutes les pièces exigées : le cas le plus bavard pour la synthèse. */
const CREATED: CompanyOpened = {
  id: 'cmp_1',
  holder: 'attached',
  mailSent: true,
};

interface Harness {
  readonly page: InformationsPage;
  /** Le DOM rendu : certains contrats se jouent à l'écran, pas dans un signal. */
  readonly fixture: ComponentFixture<InformationsPage>;
  /** La façade : ce que la page lit et déclenche. */
  readonly fiche: FicheClientFacade;
  readonly create: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly errors: unknown[];
  readonly said: string[];
  readonly modes: { entity: string; company: string; mode: string }[];
}

/** Le mode, posé par la route du payeur : on peut le faire refuser. */
let refuseMode: unknown = null;

/**
 * Monte la page **sans identifiant de route** — c'est ce qui la met en mode
 * ouverture, exactement comme la route `/comptes-clients/nouveau`.
 */
async function setup(create = vi.fn(() => Promise.resolve(CREATED))): Promise<Harness> {
  const errors: unknown[] = [];
  const said: string[] = [];
  const modes: { entity: string; company: string; mode: string }[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AdminCompaniesService,
        useValue: {
          create,
        } satisfies Pick<AdminCompaniesService, 'create'>,
      },
      {
        provide: PickupAddressesService,
        useValue: {
          list: (): Promise<readonly PickupAddressView[]> => Promise.resolve([]),
        } satisfies Pick<PickupAddressesService, 'list'>,
      },
      {
        provide: DeliveryAvailabilityService,
        useValue: {
          read: () =>
            Promise.resolve({
              openToB2b: true,
              openToB2c: true,
              windowMode: 'slot',
              updatedAt: null,
              updatedBy: null,
            }),
        } satisfies Pick<DeliveryAvailabilityService, 'read'>,
      },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string): void => {
            said.push(message);
          },
          info: (): void => undefined,
          error: (error: unknown, fallback?: string): void => {
            errors.push(error ?? fallback);
          },
        } satisfies Pick<NotifyService, 'success' | 'info' | 'error'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (): boolean => true },
      },
      {
        provide: LegalEntitiesService,
        useValue: {
          list: () => Promise.resolve([{ id: 'le1', name: 'La Folie Douce', archivedAt: null }]),
        },
      },
      {
        provide: PayerBillingModeService,
        useValue: {
          set: (entity: string, company: string, payload: { mode: string }): Promise<void> => {
            if (refuseMode !== null) {
              return Promise.reject(refuseMode);
            }
            modes.push({ entity, company, mode: payload.mode });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(InformationsPage);
  const page = fixture.componentInstance;
  // La page ne porte plus que sa saisie ; tout ce qu'elle lit vient de sa
  // façade, qu'on interroge donc directement.
  const fiche = fixture.debugElement.injector.get(FicheClientFacade);
  const navigate = vi.fn(() => Promise.resolve(true));
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  await Promise.resolve();
  await Promise.resolve();
  return { page, fixture, fiche, create, navigate, errors, said, modes };
}

/** Remplit le bloc d'ouverture avec le minimum exigé. */
function fill(page: InformationsPage): void {
  page['identityDraft'].set({
    raisonSociale: '',
    enseigne: '  Le Comptoir  ',
    formeJuridique: '',
    siret: '',
    siren: '',
    vatNumber: '',
  });
  page['openingMode'].set({ kind: 'chosen', legalEntityId: 'le1', mode: 'weekly' });
  page['holder'].set({
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@exemple.fr',
    phone: '',
  });
}

describe('InformationsPage — ouverture d’un compte', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    refuseMode = null;
  });

  it("ne conclut pas à « introuvable » quand il n'y a pas d'identifiant", async () => {
    const { fiche } = await setup();
    // L'absence d'id est ATTENDUE ici : c'est un compte qu'on ouvre, pas un
    // compte manquant.
    expect(fiche.draft()).toBe(true);
    expect(fiche.state()).toBe('ready');
  });

  it('ne réclame que ce qui OUVRE — pas le dossier d’activation', async () => {
    // Réclamer KBIS, adresses et règlement devant un formulaire vide faisait
    // passer pour bloquant ce qui ne l'est pas : un compte s'ouvre sans papiers.
    const { page, fiche } = await setup();
    expect(page['checklistSteps']().map((step) => step.key)).toEqual(['enseigne']);

    // Rien n'est réuni : le compte ne peut évidemment pas être activé.
    expect(fiche.canActivate()).toBe(false);
  });

  it("n'exige QUE le nom d'usage — ni papiers, ni détenteur", async () => {
    const { page } = await setup();
    expect(page['canCreate']()).toBe(false);

    // L'ENSEIGNE suffit : ni raison sociale, ni forme juridique, ni SIRET, ni
    // adresse du gérant. Le commercial est au téléphone avec le client — et ce
    // qui bloque ici bloque une saisie faite pendant l'appel, donc un compte qui
    // ne sera jamais ouvert.
    page['identityDraft'].set({
      raisonSociale: '',
      enseigne: 'Le Comptoir',
      formeJuridique: '',
      siret: '',
      siren: '',
      vatNumber: '',
    });

    expect(page['canCreate']()).toBe(true);
  });

  it('ouvre sans détenteur, et n’envoie alors AUCUN contact', async () => {
    // Le serveur distingue « pas de détenteur » d'un contact aux champs vides :
    // lui poster une coquille ferait échouer la validation de l'adresse.
    const { page, create } = await setup();
    page['identityDraft'].set({
      raisonSociale: '',
      enseigne: 'Le Comptoir',
      formeJuridique: '',
      siret: '',
      siren: '',
      vatNumber: '',
    });
    page['openingMode'].set({ kind: 'not-required' });

    await page['createAccount']();

    expect(create).toHaveBeenCalledWith({
      intentKey: expect.any(String),
      identity: {
        raisonSociale: '',
        enseigne: 'Le Comptoir',
        formeJuridique: '',
        siret: '',
        siren: '',
        vatNumber: '',
      },
      contact: undefined,
    });
  });

  it('ouvre le compte, rogne la saisie, et enchaîne sur sa fiche', async () => {
    const { page, create, navigate } = await setup();
    fill(page);
    await page['createAccount']();

    expect(create).toHaveBeenCalledWith({
      intentKey: expect.any(String),
      identity: {
        raisonSociale: '',
        enseigne: 'Le Comptoir',
        formeJuridique: '',
        siret: '',
        siren: '',
        vatNumber: '',
      },
      contact: {
        firstName: 'Jean',
        lastName: 'Dupont',
        fonction: '',
        // Le détenteur ne choisit pas son rôle : le serveur pose `owner`.
        role: '',
        email: 'jean@exemple.fr',
        phone: '',
      },
    });
    expect(navigate).toHaveBeenCalledWith(['/comptes-clients', 'cmp_1', 'informations'], {
      replaceUrl: true,
    });
  });

  it('n’ouvre pas tant que le mode de facturation n’est pas choisi', async () => {
    const { page, fixture, create } = await setup();
    fill(page);
    page['openingMode'].set({ kind: 'missing' });
    fixture.detectChanges();

    expect(page['canOpen']()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-opening-mode-missing]')).not.toBeNull();
    await page['createAccount']();
    expect(create).not.toHaveBeenCalled();
  });

  it('pose le mode choisi chez l’entité, juste après l’ouverture', async () => {
    const { page, modes, said } = await setup();
    fill(page);
    await page['createAccount']();

    expect(modes).toEqual([{ entity: 'le1', company: 'cmp_1', mode: 'weekly' }]);
    expect(said).toContain('Mode de facturation : Hebdomadaire.');
  });

  it('un mode refusé le dit : le compte existe, son mode reste « non choisi »', async () => {
    refuseMode = new Error('refusé');
    const { page, errors, navigate } = await setup();
    fill(page);
    await page['createAccount']();

    expect(errors).toEqual([
      "Le compte existe, mais le mode « Hebdomadaire » n'a pas pu être enregistré. " +
        'Il reste « non choisi » : choisissez-le sur la fiche, carte « Mode de facturation ».',
    ]);
    // Le compte est ouvert : on va quand même sur sa fiche, où le mode se règle.
    expect(navigate).toHaveBeenCalled();
  });

  it('garde la saisie à l’écran quand l’ouverture échoue', async () => {
    const boom = new Error('SIRET déjà connu');
    const { page, fiche, navigate, errors } = await setup(vi.fn(() => Promise.reject(boom)));
    fill(page);
    await page['createAccount']();

    expect(errors).toEqual([boom]);
    expect(navigate).not.toHaveBeenCalled();
    // Refaire la saisie après un refus serait une punition pour une erreur qui
    // n'est pas celle du commercial.
    expect(page['identityDraft']().enseigne).toBe('  Le Comptoir  ');
    expect(fiche.creating()).toBe(false);
  });
});

describe("Le bouton d'ouverture dit pourquoi il est éteint", () => {
  /**
   * Un commercial commence souvent par le détenteur — c'est la personne qu'il a
   * au téléphone. Il se retrouvait devant un bouton gris dont la cause (le champ
   * enseigne, vide) était en haut de l'écran, hors de son regard.
   */
  it("affiche la raison tant que l'enseigne manque", async () => {
    const { fixture } = await setup();
    fixture.detectChanges();

    const blocker = fixture.nativeElement.querySelector('.open-blocker');
    expect(blocker?.textContent?.trim()).toBe("Saisissez l'enseigne pour ouvrir le compte.");
  });

  it('retire la raison dès que le champ est rempli', async () => {
    const { page, fixture } = await setup();
    fill(page);
    fixture.detectChanges();

    // Reste, le cas échéant, la raison suivante : le mode de facturation.
    expect(fixture.nativeElement.querySelector('.open-blocker')?.textContent ?? '').not.toContain(
      "Saisissez l'enseigne",
    );
  });
});
