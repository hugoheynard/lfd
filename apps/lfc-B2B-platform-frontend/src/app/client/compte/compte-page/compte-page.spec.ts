import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FR } from '../../copy/fr';
import { MOCK_USERS } from '../../mock-account';
import { ComptePage } from './compte-page';

describe('ComptePage', () => {
  let fixture: ComponentFixture<ComptePage>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ComptePage],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ComptePage);
    fixture.detectChanges();
  });

  it('donne sept cartes, et un sommaire qui pointe LEURS ancres', () => {
    // Le sommaire fait défiler, il ne change pas d'écran : une entrée qui
    // pointerait une ancre absente romprait la promesse écrite sous la liste.
    const anchors = Array.from(el().querySelectorAll('.summary-link')).map((a) =>
      a.getAttribute('href')?.slice(1),
    );
    expect(anchors.length).toBe(7);
    for (const anchor of anchors) {
      expect(el().querySelector(`#${anchor}`)).not.toBeNull();
    }
  });

  it('dit la règle plutôt que de griser le champ', () => {
    // Un champ mort se lit comme une panne ; une phrase se lit comme une règle.
    expect(el().textContent).toContain(FR.account.identityNote);
    expect(el().querySelectorAll('input[disabled]').length).toBe(0);
  });

  it('date le KBIS deux fois, et nomme qui a certifié', () => {
    // Une vérification anonyme n'engage personne.
    expect(el().querySelector('.kbis-verified')?.textContent).toContain('Léa, La Folie Coffee');
  });

  it('sort le détenteur de la liste, et compte tout le monde', () => {
    expect(el().querySelectorAll('.holder').length).toBe(1);
    expect(el().querySelectorAll('.person').length).toBe(MOCK_USERS.length - 1);
    expect(el().querySelector('.card-title')?.textContent).toBeDefined();
  });

  it('n’offre les deux gestes irréversibles qu’en BORDÉ, dans leur territoire', () => {
    // Un aplat rouge invite au clic.
    const zone = el().querySelector('.danger');
    expect(zone?.querySelectorAll('.danger-cta').length).toBe(2);
    expect(zone?.textContent).toContain(FR.account.closeBody);
  });
});
