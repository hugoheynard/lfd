import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { instantToLocal, type CartAdjustment, type PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../../client-audience.service';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { ServicePoints } from '../pickup-points.store';
import { PublicCommandTermsSummary } from './public-command-terms-summary';

const LABO_ID = 'pick_labo';

/** Toute clientèle reçoit la remise — le défaut du dépôt, et celui d'ici. */
const POUR_TOUS: PickupAddressView['discountAudiences'] = { b2b: true, b2c: true };

/** Un point COMPLET : aucun cast, donc rien qui puisse mentir sur sa forme. */
function point(
  discount: CartAdjustment | null = null,
  discountAudiences: PickupAddressView['discountAudiences'] = POUR_TOUS,
): PickupAddressView {
  return {
    id: LABO_ID,
    label: 'Le Labo',
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: true,
    discount,
    discountAudiences,
    opening: { publicOpening: { start: '07:00', end: '12:00' }, proPickup: null },
  };
}

/** Le choix tel que l'accueil l'écrit, sur la journée du jour — « aujourd'hui ». */
function choiceToday(): ServiceChoice {
  return {
    mode: 'pickup',
    place: 'Le Labo',
    at: 'au Labo',
    address: "Route de la Balme, Val d'Isère",
    pickupAddressId: LABO_ID,
    slot: '7 h 15',
    window: { start: '07:15', end: '07:30' },
    date: instantToLocal(new Date()).day,
  };
}

interface Monde {
  readonly choice?: ServiceChoice | null;
  readonly pickup?: PickupAddressView;
}

function boot({
  choice = choiceToday(),
  pickup = point(),
}: Monde = {}): ComponentFixture<PublicCommandTermsSummary> {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PublicCommandTermsSummary],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // Un visiteur est `b2c` : c'est ce que la boutique publique sert.
      { provide: ClientAudience, useValue: { shown: () => 'b2c', current: () => 'b2c' } },
    ],
  });
  // 🔴 On SÈME le vrai dépôt plutôt que de le doubler — son `receive()` est
  // public pour ça, et il tient l'hydratation pour faite : aucune requête ne
  // part, et les tests passent par la vraie conversion d'un point servi.
  TestBed.inject(ServicePoints).receive([pickup], []);
  TestBed.inject(OrderContextStore).choice.set(choice);
  const fixture = TestBed.createComponent(PublicCommandTermsSummary);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<PublicCommandTermsSummary>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const textOf = (fixture: ComponentFixture<PublicCommandTermsSummary>, selector: string): string =>
  el(fixture).querySelector(selector)?.textContent?.trim() ?? '';

describe('PublicCommandTermsSummary', () => {
  /**
   * 🔴 « Je n'ai pas encore dit où je suis servi » est un état de PLEIN DROIT :
   * on visite d'abord, on choisit ensuite. Une carte disant « aucune maison »
   * transformerait cette liberté en manque.
   */
  it('ne montre RIEN tant qu’aucun service n’est choisi', () => {
    expect(el(boot({ choice: null })).querySelector('.terms')).toBeNull();
  });

  it('rappelle la maison et le moment retenus', () => {
    const fixture = boot();

    expect(textOf(fixture, '.place')).toBe('Le Labo');
    expect(textOf(fixture, '.when')).toContain('7 h 15');
  });

  /**
   * ⚠️ Sans remise, le lecteur d'offre rend un TARIF (« Prix boutique »), pas un
   * gain. L'afficher dans une pastille annoncerait un avantage qui n'existe pas.
   */
  it('n’affiche aucune pastille quand le point ne remise rien', () => {
    expect(el(boot()).querySelector('.offer')).toBeNull();
  });

  it('affiche la pastille quand le point remise vraiment', () => {
    const fixture = boot({ pickup: point({ mode: 'percent', bp: 1000 }) });

    expect(el(fixture).querySelector('.offer')).not.toBeNull();
  });

  /**
   * 🔴 Le cas qui justifie de relire la remise du POINT plutôt que de la porter
   * dans le choix : une remise réservée aux pros ne s'annonce pas à un
   * visiteur, qui est `b2c`. C'est la règle que le serveur applique au devis —
   * l'annoncer ici la ferait mentir à la facture.
   */
  it('tait une remise qui ne vise que les pros', () => {
    const fixture = boot({
      pickup: point({ mode: 'percent', bp: 2000 }, { b2b: true, b2c: false }),
    });

    expect(el(fixture).querySelector('.offer')).toBeNull();
  });

  /**
   * 🔴 Deux gestes SÉPARÉS : un unique « Modifier » reposerait les deux
   * questions, et vouloir une autre heure ferait re-choisir la maison.
   */
  it('demande la maison et l’heure par deux gestes distincts', () => {
    const fixture = boot();
    const asked: string[] = [];
    fixture.componentInstance.houseRequested.subscribe(() => asked.push('maison'));
    fixture.componentInstance.timeRequested.subscribe(() => asked.push('heure'));

    const acts = [...el(fixture).querySelectorAll<HTMLButtonElement>('.act')];
    expect(acts).toHaveLength(2);
    acts[0]?.click();
    acts[1]?.click();

    expect(asked).toEqual(['maison', 'heure']);
  });
});
