import { TestBed } from '@angular/core/testing';
import type { CustomerLookupView, CustomerSearchView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { HolderPicker, type HolderChoice } from '../holder-picker/holder-picker';

/** Le débounce du composant — assez pour laisser finir de taper. */
const SEARCH_DEBOUNCE_MS = 350;

const JEAN: CustomerLookupView = {
  userId: 'user_1',
  email: 'jean@exemple.fr',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: '0600000000',
  status: 'active',
  companies: [
    { id: 'cmp_a', raisonSociale: 'Le Comptoir' },
    { id: 'cmp_b', raisonSociale: 'La Cave' },
  ],
};

interface Harness {
  readonly picker: HolderPicker;
  readonly search: ReturnType<typeof vi.fn>;
  readonly emitted: (HolderChoice | null)[];
  /** Fait tourner les effets — l'app est zoneless, rien ne se propage tout seul. */
  readonly flush: () => void;
}

function setup(results: readonly CustomerLookupView[] | Error = [], truncated = false): Harness {
  const search = vi.fn(() =>
    results instanceof Error
      ? Promise.reject(results)
      : Promise.resolve({ results, truncated } satisfies CustomerSearchView),
  );
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: { searchCustomers: search } satisfies Pick<
          AdminCompaniesService,
          'searchCustomers'
        >,
      },
    ],
  });
  const fixture = TestBed.createComponent(HolderPicker);
  const picker = fixture.componentInstance;
  const emitted: (HolderChoice | null)[] = [];
  picker.holderChange.subscribe((choice) => emitted.push(choice));
  fixture.detectChanges();
  return {
    picker,
    search,
    emitted,
    flush: () => {
      TestBed.tick();
    },
  };
}

describe('HolderPicker', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  it('ne cherche pas sur une seule lettre', async () => {
    // En dessous de deux caractères, la recherche rendrait le fichier entier :
    // ça n'aide personne et ça fait travailler la base pour rien.
    const { picker, search } = setup([JEAN]);
    picker['term'].set('j');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(search).not.toHaveBeenCalled();
  });

  it('cherche une seule fois quand on tape vite', async () => {
    const { picker, search } = setup([JEAN]);
    picker['term'].set('je');
    picker['term'].set('jea');
    picker['term'].set('jean');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('jean');
  });

  it('retient un client existant, avec ses coordonnées à lui', async () => {
    // On reprend SON e-mail, pas celui tapé dans la recherche : c'est par lui
    // que le backend le reconnaîtra et rattachera la société à son espace.
    const { picker, emitted, flush } = setup([JEAN]);
    picker['choose'](JEAN);
    flush();

    expect(emitted.at(-1)).toEqual({
      email: 'jean@exemple.fr',
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '0600000000',
      existing: JEAN,
    });
  });

  it("n'exige que l'adresse pour inscrire un nouveau détenteur", async () => {
    // Prénom et nom sont utiles, pas nécessaires : le commercial est chez son
    // client, pas en train de remplir un dossier.
    const { picker, emitted, flush } = setup([]);
    picker['startCreating']();
    picker['draftEmail'].set('  nouveau@exemple.fr  ');
    flush();

    expect(emitted.at(-1)).toEqual({
      email: 'nouveau@exemple.fr',
      firstName: '',
      lastName: '',
      phone: '',
      existing: null,
    });
  });

  it('reprend le terme cherché comme adresse quand c’en est une', async () => {
    // Il vient de la taper : la lui redemander serait de la paperasse.
    const { picker } = setup([]);
    picker['term'].set('nouveau@exemple.fr');
    picker['startCreating']();

    expect(picker['draftEmail']()).toBe('nouveau@exemple.fr');
  });

  it('ne propose pas d’inscrire avant d’avoir cherché', async () => {
    // « Aucun résultat » ne veut rien dire tant qu'on n'a rien demandé.
    const { picker } = setup([]);
    expect(picker['empty']()).toBe(false);

    picker['term'].set('inconnu');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(picker['empty']()).toBe(true);
  });

  it('laisse inscrire quelqu’un même si la recherche est en panne', async () => {
    // Cette lecture aide à la saisie, elle ne la remplace pas : une API muette
    // ne doit pas empêcher d'ouvrir un compte.
    const { picker, emitted, flush } = setup(new Error('hors service'));
    picker['term'].set('jean');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(picker['results']()).toEqual([]);
    picker['startCreating']();
    picker['draftEmail'].set('jean@exemple.fr');
    flush();
    expect(emitted.at(-1)?.email).toBe('jean@exemple.fr');
  });

  it('abandonne le choix quand on revient en arrière', async () => {
    const { picker, emitted, flush } = setup([JEAN]);
    picker['choose'](JEAN);
    flush();
    picker['reset']();
    flush();

    expect(emitted.at(-1)).toBeNull();
  });
});

describe('HolderPicker — une recherche qui ne ment pas', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  it("DIT que d'autres clients correspondent", async () => {
    // Sans ça, le commercial conclut que son client n'existe pas et lui ouvre
    // un second espace — le doublon que cette recherche évite.
    const { picker, flush } = setup([JEAN], true);

    picker['term'].set('dupont');
    flush();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(picker['truncated']()).toBe(true);
  });

  it('ignore une réponse DÉPASSÉE par une recherche plus récente', async () => {
    // Le débounce annule le minuteur, jamais la requête déjà partie : sans
    // garde d'ordre, la plus lente gagne et la liste montre les résultats d'un
    // terme déjà effacé.
    const { picker } = setup([JEAN]);
    const search = picker['search'].bind(picker) as (term: string) => Promise<void>;

    const stale = search('va');
    const fresh = search('vasseur');
    await Promise.all([stale, fresh]);

    // Deux appels, un seul état : celui de la dernière recherche lancée.
    expect(picker['results']()).toEqual([JEAN]);
  });
});
