import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../notify.service';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany } from '../admin-company';
import { NouveauComptePage } from '../nouveau-compte/nouveau-compte-page';

/** La partie du service que la page appelle — un `Pick`, sinon les privés fuitent. */
type CompaniesPort = Pick<AdminCompaniesService, 'create'>;

const CREATED = { id: 'cmp_1' } as AdminCompany;

interface Harness {
  readonly page: NouveauComptePage;
  readonly create: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly errors: unknown[];
}

async function setup(create = vi.fn(() => Promise.resolve(CREATED))): Promise<Harness> {
  const errors: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: AdminCompaniesService, useValue: { create } satisfies CompaniesPort },
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
  const page = TestBed.createComponent(NouveauComptePage).componentInstance;
  const navigate = vi.fn(() => Promise.resolve(true));
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  return { page, create, navigate, errors };
}

/** Remplit le formulaire avec le minimum que la page exige. */
function fill(page: NouveauComptePage): void {
  page['identity'].set({
    raisonSociale: '  La Folie Douce  ',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: '',
  });
  page['contact'].set({
    firstName: 'Jean',
    lastName: 'Dupont',
    fonction: '',
    email: ' jean@exemple.fr ',
    phone: '',
  });
}

describe('NouveauComptePage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("n'ouvre rien tant que l'identité et le contact ne sont pas là", async () => {
    const { page } = await setup();
    expect(page['canSubmit']()).toBe(false);

    // L'identité seule ne suffit pas : sans interlocuteur, personne à rappeler.
    page['identity'].set({
      raisonSociale: 'La Folie Douce',
      enseigne: '',
      formeJuridique: 'SAS',
      siret: '12345678901234',
      tvaIntracom: '',
    });
    expect(page['canSubmit']()).toBe(false);
  });

  it('ouvre le compte puis enchaîne sur sa fiche, sans laisser le formulaire dans l’historique', async () => {
    const { page, create, navigate } = await setup();
    fill(page);
    await page['submit']();

    // Les valeurs partent ROGNÉES : un espace de copier-coller ne doit pas
    // devenir une raison sociale qui ne ressort d'aucune recherche.
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

  it('garde la saisie à l’écran quand la création échoue', async () => {
    const boom = new Error('SIRET déjà connu');
    const { page, navigate, errors } = await setup(vi.fn(() => Promise.reject(boom)));
    fill(page);
    await page['submit']();

    expect(errors).toEqual([boom]);
    expect(navigate).not.toHaveBeenCalled();
    // Le formulaire reste rempli — refaire la saisie après un refus serait une
    // punition pour une erreur qui n'est pas celle du commercial.
    expect(page['identity']().raisonSociale).toBe('  La Folie Douce  ');
    expect(page['submitting']()).toBe(false);
  });
});
