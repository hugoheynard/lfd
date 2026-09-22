import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyView } from '@lfd/contracts';

import { AccountService, type AccountStatus } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ProAccountSection } from './pro-account-section';

/**
 * Le double reproduit la RÈGLE du service (statut lu + liste des sociétés) : la
 * section se pilote alors par l'histoire qu'on raconte — « `/me` est en vol »,
 * « il a deux entreprises » — et non par un booléen posé à la main.
 */
function company(over: Partial<CompanyView> = {}): CompanyView {
  return { ...TOMMEUSES, ...over };
}

describe('ProAccountSection', () => {
  let status: ReturnType<typeof signal<AccountStatus>>;
  let companies: ReturnType<typeof signal<readonly CompanyView[]>>;
  let fixture: ComponentFixture<ProAccountSection>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const card = (): HTMLElement | null => el().querySelector('fold-card');
  const link = (): HTMLAnchorElement | null => el().querySelector('a');
  const items = (): readonly string[] =>
    Array.from(el().querySelectorAll('.item')).map((node) => node.textContent ?? '');

  const boot = (): void => {
    fixture = TestBed.createComponent(ProAccountSection);
    fixture.detectChanges();
  };

  beforeEach(() => {
    status = signal<AccountStatus>('loading');
    companies = signal<readonly CompanyView[]>([]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProAccountSection],
      providers: [
        provideRouter([]),
        {
          provide: AccountService,
          useValue: {
            status,
            companies,
            hasNoCompany: computed(() => status() === 'ready' && companies().length === 0),
          },
        },
      ],
    });
  });

  it('ne montre rien tant que `/me` est en vol — le bloc ne clignote pas', () => {
    boot();
    expect(card()).toBeNull();
  });

  it('propose d’ouvrir un compte à qui n’en a aucun', () => {
    status.set('ready');
    boot();

    expect(el().textContent).toContain(FR.account.proAccountTitle);
    expect(el().textContent).toContain(FR.account.proAccountLead);
    expect(items()).toEqual([]);
  });

  /**
   * Régression : la section ne s'affichait **qu'à** qui n'avait aucune société
   * (« on ne propose pas d'ouvrir ce qu'on a déjà »). Hugo l'a corrigée le jour
   * même — rien ailleurs dans la boutique ne dit à quelles entreprises on est
   * rattaché, et ouvrir un SECOND compte est un cas réel (2026-09-22).
   */
  it('liste les entreprises de la personne, et propose d’en ouvrir une autre', () => {
    status.set('ready');
    companies.set([
      company({ id: 'c_1', enseigne: 'Les Tommeuses', reference: 'C-000123' }),
      company({ id: 'c_2', enseigne: 'Café du Port', reference: 'C-000456', status: 'pending' }),
    ]);
    boot();

    expect(el().textContent).toContain(FR.account.proAccountsTitle);
    expect(items()).toHaveLength(2);
    expect(items()[0]).toContain('Les Tommeuses');
    expect(items()[0]).toContain('C-000123');
    expect(items()[1]).toContain('Café du Port');
    // L'état du dossier se dit avec les mots déjà employés partout ailleurs.
    expect(items()[1]).toContain(FR.account.states.pending);
    expect(link()?.textContent?.trim()).toBe(FR.account.proAccountAnother);
  });

  /**
   * L'enseigne est le nom sous lequel la personne commande ; la raison sociale
   * ne sert que si l'enseigne manque — ce qui arrive tant que le dossier n'est
   * pas complété.
   */
  it('nomme l’entreprise par son enseigne, et retombe sur la raison sociale', () => {
    status.set('ready');
    companies.set([company({ id: 'c_3', enseigne: '  ', raisonSociale: 'BOULANGERIE X SARL' })]);
    boot();

    expect(items()[0]).toContain('BOULANGERIE X SARL');
  });

  it('mène à `/ouverture-compte-pro` par un LIEN — pas par un bouton', () => {
    status.set('ready');
    boot();

    const anchor = link();
    expect(anchor?.getAttribute('href')).toBe('/ouverture-compte-pro');
    expect(anchor?.textContent?.trim()).toBe(FR.account.proAccountLink);
    // Un bouton qui naviguerait ne donnerait ni la barre d'état ni le nouvel onglet.
    expect(el().querySelector('button')).toBeNull();
  });

  it('bascule d’un état à l’autre dès qu’un rattachement arrive', () => {
    status.set('ready');
    boot();
    expect(el().textContent).toContain(FR.account.proAccountTitle);

    companies.set([company({ id: 'c_1' })]);
    fixture.detectChanges();

    expect(el().textContent).toContain(FR.account.proAccountsTitle);
    expect(items()).toHaveLength(1);
  });
});
