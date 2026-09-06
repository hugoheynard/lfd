import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FulfillmentDayView, PickupAddressView } from '@lfd/contracts';

import { fill } from '../../../../client/copy/client-copy.service';
import { FR } from '../../../../client/copy/fr';
import { ServicePoints } from '../../../../client/shop/pickup-points.store';
import { PickupDialog } from './pickup-dialog';

/**
 * Les points **de la plateforme**, posés dans le vrai dépôt.
 *
 * Ils venaient d'une maquette écrite en dur, remise en pourcentage comprise. La
 * suite les pose désormais par `ServicePoints.receive`, ce qui la fait passer
 * par la sélection du défaut et le formatage réel de la remise.
 */
const POINT = (over: Partial<PickupAddressView>): PickupAddressView => ({
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'percent', bp: 1_000 },
  // De vraies heures : la grille de créneaux s'en déduit, et le trou entre les
  // deux fenêtres est celui qu'aucune maquette ne savait montrer.
  opening: {
    proPickup: { start: '05:00', end: '06:30' },
    publicOpening: { start: '07:00', end: '09:00' },
  },
  ...over,
});

const POINTS: readonly PickupAddressView[] = [
  POINT({}),
  POINT({ id: 'pick_village', label: 'Le Village', isDefault: false, discount: null }),
];

/**
 * La journée que le SERVEUR accorde à chaque point. Elle était calculée par
 * l'écran — « demain », depuis l'horloge du navigateur, sans heure limite.
 */
const DAYS: readonly FulfillmentDayView[] = [
  { pickupAddressId: null, date: '2026-09-09' },
  { pickupAddressId: 'pick_labo', date: '2026-09-09' },
  { pickupAddressId: 'pick_village', date: '2026-09-11' },
];

describe('PickupDialog', () => {
  let fixture: ComponentFixture<PickupDialog>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const cta = (): HTMLButtonElement => {
    const found = el().querySelector('.cta');
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error('Pas de bouton de confirmation.');
    }
    return found;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PickupDialog], providers: [provideHttpClient()] });
    TestBed.inject(ServicePoints).receive(POINTS, [], DAYS);
    fixture = TestBed.createComponent(PickupDialog);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  it("présélectionne l'habitude, et annonce sa remise", () => {
    const on = el().querySelector('.point.on');
    expect(on?.textContent).toContain('Le Labo');
    expect(on?.textContent).toContain(FR.pickupDialog.habit);
    expect(cta().textContent).toContain(fill(FR.pickupDialog.ctaDiscount, { value: '10 %' }));
  });

  it('le bouton mène au CRÉNEAU, puis au panier', () => {
    // Où et quand sont deux temps d'une même question : le dialogue glisse au
    // lieu de se fermer, et le lieu retenu reste sous les yeux.
    let done = 0;
    fixture.componentInstance.done.subscribe(() => (done += 1));

    cta().click();
    fixture.detectChanges();
    expect(el().querySelector('app-slot-step')?.textContent).toContain('Le Labo');
    expect(cta().textContent).toContain(FR.slotStep.ctaIdle);

    const slot = el().querySelectorAll('button.slot')[0] as HTMLButtonElement;
    slot.click();
    fixture.detectChanges();
    expect(cta().textContent).toContain(FR.slotStep.cta);

    cta().click();
    expect(done).toBe(1);
  });

  /**
   * 🔴 La grille se lit sur les HEURES DÉCLARÉES du point, et le trou entre les
   * deux fenêtres reste un trou : pros 5 h–6 h 30, public 7 h–9 h, et rien
   * entre les deux. La maquette proposait 6 h – 7 h à tout le monde.
   */
  it('déduit les créneaux des heures du point, sans combler le trou', () => {
    cta().click();
    fixture.detectChanges();

    const hours = [...el().querySelectorAll('button.slot .hour')].map((n) => n.textContent?.trim());
    // Espaces INSÉCABLES avant le `h` et le tiret : l'écriture française, et
    // une différence que l'œil ne verrait pas dans un littéral.
    const NB = '\u00A0';
    expect(hours).toEqual([
      `5${NB}h${NB}– 6${NB}h`,
      `6${NB}h${NB}– 6${NB}h${NB}30`,
      `7${NB}h${NB}– 8${NB}h`,
      `8${NB}h${NB}– 9${NB}h`,
    ]);
    // Ce que le PUBLIC n'a pas est la seule restriction que le système sache lire.
    const subs = [...el().querySelectorAll('button.slot .sub')].map((n) => n.textContent?.trim());
    expect(subs).toEqual([
      FR.slotStep.proOnly,
      FR.slotStep.proOnly,
      FR.slotStep.free,
      FR.slotStep.free,
    ]);
  });

  /** La journée vient du serveur, point par point — pas d'un « demain » local. */
  it('emporte la journée que le SERVEUR accorde à ce point', () => {
    const emitted: string[] = [];
    fixture.componentInstance.done.subscribe((choice) => emitted.push(choice.date));

    cta().click();
    fixture.detectChanges();
    (el().querySelectorAll('button.slot')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    cta().click();

    expect(emitted).toEqual(['2026-09-09']);
  });

  /**
   * Aucune journée demandable ⇒ **rien ne part**. Retomber sur « demain »
   * ferait afficher une date que la commande refuserait ensuite.
   */
  it('refuse de valider quand le serveur n’accorde aucune journée', () => {
    TestBed.inject(ServicePoints).receive(POINTS, [], [{ pickupAddressId: null, date: null }]);
    let done = 0;
    fixture.componentInstance.done.subscribe(() => (done += 1));

    cta().click();
    fixture.detectChanges();
    (el().querySelectorAll('button.slot')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    cta().click();

    expect(done).toBe(0);
    expect(cta().disabled).toBe(true);
  });

  it('changer de point fait perdre la remise au BOUTON, avant de confirmer', () => {
    // C'est tout l'intérêt de la porter jusque-là : le renoncement se lit.
    const points = el().querySelectorAll('button.point');
    (points[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el().textContent).toContain(FR.pickupDialog.shopPrice);
    expect(cta().textContent?.trim()).toBe(FR.pickupDialog.cta);
  });
});
