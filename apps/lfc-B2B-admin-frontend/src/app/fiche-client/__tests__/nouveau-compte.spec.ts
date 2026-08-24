import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
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
}

/**
 * Monte la page **sans identifiant de route** — c'est ce qui la met en mode
 * ouverture, exactement comme la route `/comptes-clients/nouveau`.
 */
async function setup(create = vi.fn(() => Promise.resolve(CREATED))): Promise<Harness> {
  const errors: unknown[] = [];
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
  const fixture = TestBed.createComponent(InformationsPage);
  const page = fixture.componentInstance;
  // La page ne porte plus que sa saisie ; tout ce qu'elle lit vient de sa
  // façade, qu'on interroge donc directement.
  const fiche = fixture.debugElement.injector.get(FicheClientFacade);
  const navigate = vi.fn(() => Promise.resolve(true));
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  await Promise.resolve();
  await Promise.resolve();
  return { page, fixture, fiche, create, navigate, errors };
}

/** Remplit le bloc d'ouverture avec le minimum exigé. */
function fill(page: InformationsPage): void {
  page['identityDraft'].set({
    raisonSociale: '',
    enseigne: '  Le Comptoir  ',
    formeJuridique: '',
    siret: '',
    vatNumber: '',
  });
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
      vatNumber: '',
    });

    await page['createAccount']();

    expect(create).toHaveBeenCalledWith({
      identity: {
        raisonSociale: '',
        enseigne: 'Le Comptoir',
        formeJuridique: '',
        siret: '',
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
      identity: {
        raisonSociale: '',
        enseigne: 'Le Comptoir',
        formeJuridique: '',
        siret: '',
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

    expect(fixture.nativeElement.querySelector('.open-blocker')).toBeNull();
  });
});
