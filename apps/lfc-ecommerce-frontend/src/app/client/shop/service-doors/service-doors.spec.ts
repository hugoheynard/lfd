import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DoorCopy } from '../../copy/screens/accueil-public.copy';
import { ServiceDoors } from './service-doors';

const PICKUP: DoorCopy = {
  tag: 'Retrait',
  title: 'Je passe\nla prendre',
  intro: 'Au Labo ou au village.',
  cta: 'Choisir un point de retrait',
  note: 'Remise au retrait',
};

const COURIER: DoorCopy = {
  tag: 'Coursier',
  title: 'On vous\nl’apporte',
  intro: 'Demain, au créneau que vous choisissez.',
  cta: 'Choisir une adresse',
  note: 'Avant 18 h',
  pending: { tag: 'Bientôt', hint: 'Votre dossier est en cours de validation.' },
};

function boot(courierState: 'open' | 'pending'): ComponentFixture<ServiceDoors> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ServiceDoors] });
  const fixture = TestBed.createComponent(ServiceDoors);
  fixture.componentRef.setInput('pickupCopy', PICKUP);
  fixture.componentRef.setInput('courierCopy', COURIER);
  fixture.componentRef.setInput('courierState', courierState);
  fixture.detectChanges();
  return fixture;
}

const doors = (fixture: ComponentFixture<ServiceDoors>): readonly Element[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll('.door'),
];

describe('ServiceDoors', () => {
  it('ouvre les deux portes quand la livraison est offerte', () => {
    const fixture = boot('open');

    expect(doors(fixture)).toHaveLength(2);
    expect(doors(fixture)[0]?.querySelector('.door-cta')?.textContent?.trim()).toBe(PICKUP.cta);
    expect(doors(fixture)[1]?.querySelector('.door-cta')?.textContent?.trim()).toBe(COURIER.cta);
  });

  /**
   * 🔴 LES DEUX PORTES SONT LÀ DANS LES DEUX CAS. Un pro dont le dossier est en
   * cours ne doit pas voir une page amputée : la porte reste, et c'est son pied
   * qui change.
   */
  it('garde les deux portes quand la livraison est en attente', () => {
    const fixture = boot('pending');

    expect(doors(fixture)).toHaveLength(2);
    expect(doors(fixture)[1]?.classList.contains('is-pending')).toBe(true);
  });

  /**
   * 🔴 Le refus PRÉCÈDE l'effort : la porte en attente est fermée pour de bon,
   * elle n'attend pas le clic pour le dire. Et elle DIT ce qu'on attend — un
   * refus muet renvoie chercher la raison ailleurs.
   */
  it('ferme la porte en attente et dit ce qu’on attend, au lieu de son bouton', () => {
    const courrier = doors(boot('pending'))[1];

    expect((courrier as HTMLButtonElement).disabled).toBe(true);
    expect(courrier?.querySelector('.door-cta')).toBeNull();
    expect(courrier?.querySelector('.door-wait')?.textContent?.trim()).toBe(COURIER.pending?.hint);
    expect(courrier?.querySelector('.door-tag')?.textContent?.trim()).toBe(COURIER.pending?.tag);
  });

  it('rend le retrait quoi qu’il arrive — c’est le mode que tout le monde a', () => {
    expect(doors(boot('pending'))[0]?.classList.contains('door-pickup')).toBe(true);
  });

  /**
   * Les deux portes émettent, elles ne naviguent pas : c'est l'écran qui sait
   * ce qu'un choix déclenche, et le jour où la boutique les montrera aussi,
   * elle en fera autre chose.
   */
  it('émet le choix plutôt que d’agir', () => {
    const fixture = boot('open');
    const choisis: string[] = [];
    fixture.componentInstance.pickupChosen.subscribe(() => choisis.push('retrait'));
    fixture.componentInstance.courierChosen.subscribe(() => choisis.push('coursier'));

    doors(fixture).forEach((door) => (door as HTMLButtonElement).click());

    expect(choisis).toEqual(['retrait', 'coursier']);
  });

  /**
   * Régression : la coupe du titre vient du DICTIONNAIRE et non d'un `<br>` —
   * une traduction n'a pas à connaître le HTML, et l'italien ne se coupe pas
   * comme le français. Le rendu doit donc garder le saut de ligne tel quel.
   */
  it('garde la coupe de ligne que la copie porte', () => {
    const titre = doors(boot('open'))[0]?.querySelector('.door-title');

    expect(titre?.textContent).toBe(PICKUP.title);
    expect(titre?.querySelector('br')).toBeNull();
  });
});
