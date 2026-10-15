import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CartAdjustment, PickupAddressView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../../client-audience.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../../client-workspace.fixture';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ServicePoints } from '../pickup-points.store';
import { PublicHousePickerDialog } from './public-house-picker-dialog';
import { ShopCopyOverrides } from '../../copy/shop-copy-overrides';

/** Un point COMPLET : aucun cast, donc rien qui puisse mentir sur sa forme. */
function point(
  id: string,
  label: string,
  discount: CartAdjustment | null = null,
): PickupAddressView {
  return {
    id,
    label,
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    discount,
    discountAudiences: { b2b: true, b2c: true },
    opening: { publicOpening: { start: '07:00', end: '12:00' }, proPickup: null },
  };
}

const LABO = point('pick_labo', 'Le Labo');
const VILLAGE = point('pick_village', 'Le Village', { mode: 'percent', bp: 1000 });

interface Monde {
  readonly currentId?: string | null;
  readonly points?: readonly PickupAddressView[];
  readonly workspace?: WorkspaceDouble;
}

/** Ce que le dialogue a rendu en se fermant — `undefined` tant qu'il est ouvert. */
interface Closed {
  readonly results: unknown[];
}

function boot({
  currentId = null,
  points = [LABO, VILLAGE],
  workspace = workspaceDouble(),
}: Monde = {}): {
  readonly fixture: ComponentFixture<PublicHousePickerDialog>;
  readonly closed: Closed;
} {
  const closed: Closed = { results: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PublicHousePickerDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ClientAudience, useValue: { shown: () => 'b2c', current: () => 'b2c' } },
      provideWorkspace(workspace),
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, (result: unknown) => closed.results.push(result)),
      },
    ],
  });
  // Le VRAI dépôt, semé : `receive()` tient l'hydratation pour faite, donc le
  // constructeur du dialogue ne part chercher personne.
  TestBed.inject(ServicePoints).receive([...points], []);
  const fixture = TestBed.createComponent(PublicHousePickerDialog);
  fixture.componentRef.setInput('data', { currentId });
  fixture.detectChanges();
  return { fixture, closed };
}

const houses = (fixture: ComponentFixture<PublicHousePickerDialog>): HTMLButtonElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.house'),
];

describe('PublicHousePickerDialog', () => {
  it('propose une carte par maison ouverte', () => {
    expect(houses(boot().fixture)).toHaveLength(2);
  });

  /**
   * Hugo, 2026-10-15 : la liste est filtrée AU SERVEUR par la clientèle. Le
   * dialogue propose ce qu'on lui sert, sans refiltrer.
   */
  it('propose les maisons servies, sans les refiltrer', () => {
    const reserved: PickupAddressView = { ...LABO, pickupAudiences: { b2b: true, b2c: false } };
    const rendered = houses(boot({ points: [reserved, VILLAGE] }).fixture);

    expect(rendered).toHaveLength(2);
  });

  /** Plus de point par défaut : la présélection suit `preselectedPickupId`. */
  describe('la présélection', () => {
    const checked = (fixture: ComponentFixture<PublicHousePickerDialog>): readonly string[] =>
      houses(fixture)
        .filter((house) => house.getAttribute('aria-checked') === 'true')
        .map((house) => house.querySelector('.name')?.textContent?.trim() ?? '');

    it('coche la seule maison servie, et ouvre l’action', () => {
      const { fixture } = boot({ points: [VILLAGE] });

      expect(checked(fixture)).toEqual(['Le Village']);
      const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.cta');
      expect(cta?.disabled).toBe(false);
    });

    it('ne coche rien à plusieurs maisons, sans préférence', () => {
      expect(checked(boot().fixture)).toEqual([]);
    });

    it('coche la maison préférée de la société parmi plusieurs', () => {
      const company = {
        ...TOMMEUSES,
        fulfillmentPreference: {
          ...TOMMEUSES.fulfillmentPreference,
          method: 'pickup' as const,
          pickupAddressId: 'pick_village',
        },
      };
      const workspace = workspaceDouble(company.id, [company]);

      expect(checked(boot({ workspace }).fixture)).toEqual(['Le Village']);
    });
  });

  it('nomme chaque maison par son enseigne', () => {
    const [premier] = houses(boot().fixture);

    expect(premier?.querySelector('.name')?.textContent?.trim()).toBe('Le Labo');
  });

  /** Sans repère, on ne sait plus ce qu'on avait retenu en rouvrant le choix. */
  it('marque la maison déjà retenue, et elle seule', () => {
    const rendered = houses(boot({ currentId: 'pick_village' }).fixture);

    expect(rendered.filter((house) => house.classList.contains('on'))).toHaveLength(1);
    expect(rendered[1]?.classList.contains('on')).toBe(true);
    expect(rendered[1]?.querySelector('.tag')).not.toBeNull();
  });

  it('ne marque rien quand aucune maison n’a encore été choisie', () => {
    expect(houses(boot().fixture).filter((h) => h.classList.contains('on'))).toHaveLength(0);
  });

  /**
   * 🔴 SÉLECTIONNER N'EST PAS CONFIRMER (2026-09-20). Toucher une rangée
   * fermait tout et enchaînait sur l'heure : on ne pouvait pas comparer deux
   * maisons — la première touchée était la bonne — et le geste n'avait pas de
   * retour en arrière, alors que le volet suivant en a un.
   */
  it('ne ferme RIEN quand on touche une rangée', () => {
    const { fixture, closed } = boot();

    houses(fixture)[1]?.click();
    fixture.detectChanges();

    expect(closed.results).toEqual([]);
    expect(houses(fixture)[1]?.getAttribute('aria-checked')).toBe('true');
    expect(houses(fixture)[0]?.getAttribute('aria-checked')).toBe('false');
  });

  /**
   * 🔴 Le dialogue rend le POINT, il ne décide pas de la suite : changer de
   * maison périme l'heure, et c'est l'appelant qui enchaîne sur le sélecteur.
   */
  it('rend le point retenu quand le pied confirme', () => {
    const { fixture, closed } = boot();

    houses(fixture)[1]?.click();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.cta')?.click();

    expect(closed.results).toEqual([VILLAGE]);
  });

  /**
   * L'action est FERMÉE tant qu'aucune maison n'est retenue — le refus précède
   * l'effort, comme partout ailleurs dans ce parcours.
   */
  it('garde l’action fermée tant que rien n’est retenu', () => {
    const { fixture } = boot();
    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.cta');

    expect(cta?.disabled).toBe(true);

    houses(fixture)[0]?.click();
    fixture.detectChanges();

    expect(cta?.disabled).toBe(false);
  });

  /**
   * ⚠️ Sans remise, l'étiquette annonce un TARIF et non un gain : elle est
   * alors rendue en sourdine (`is-plain`). La distinction est ce qui empêche
   * « Prix boutique » de ressembler à un avantage.
   */
  it('distingue une vraie remise d’un simple tarif', () => {
    const rendered = houses(boot().fixture);

    expect(rendered[0]?.querySelector('.offer')?.classList.contains('is-plain')).toBe(true);
    expect(rendered[1]?.querySelector('.offer')?.classList.contains('is-plain')).toBe(false);
  });

  /** Lot T4 des textes : un remplacement reçu redessine l'écran, sans rechargement. */
  it('se redessine quand un remplacement de son texte arrive', () => {
    const { fixture } = boot();
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'housePicker.title': 'Quelle maison ?' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.screen')?.textContent).toBe(
      'Quelle maison ?',
    );
  });
});
