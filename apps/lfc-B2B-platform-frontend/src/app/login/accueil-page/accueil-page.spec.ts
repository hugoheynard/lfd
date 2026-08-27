import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientChrome } from '../../client/client-chrome.service';
import { AccueilPage } from './accueil-page';

/**
 * L'écran est piloté par le DOM : ses membres sont `protected`, et ce qui compte
 * est ce que voit la personne qui l'utilise.
 */
describe('AccueilPage', () => {
  let fixture: ComponentFixture<AccueilPage>;
  let chrome: ClientChrome;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const click = (label: string): void => {
    button(label).click();
    fixture.detectChanges();
  };

  const type = (index: number, value: string): void => {
    const input = el().querySelectorAll('input')[index];
    if (!input) {
      throw new Error(`Pas de champ n°${index} à l'écran.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /** L'ordre des champs : prénom, téléphone, e-mail — celui du DOM aux deux plis. */
  const FIRST = 0;
  const TEL = 1;
  const MAIL = 2;

  const fillSignup = (): void => {
    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    type(MAIL, 'pierre@brasserie-marchand.fr');
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AccueilPage] });
    fixture = TestBed.createComponent(AccueilPage);
    chrome = TestBed.inject(ClientChrome);
    fixture.detectChanges();
  });

  it("ouvre sur l'accueil visiteur, sans retour possible", () => {
    expect(text()).toContain('Première visite ?');
    // Le sur-titre et le retour vivent dans l'en-tête du shell : l'écran les
    // PUBLIE, il ne les dessine plus.
    expect(chrome.kicker()).toBe('Bienvenue');
    expect(chrome.back()).toBeNull();
  });

  it("le formulaire est replié, et « S'inscrire » l'ouvre", () => {
    // Le pli lui-même est une affaire de largeur, donc de CSS — ce que le test
    // vérifie, c'est le CONTRAT que le CSS suit : l'état annoncé aux
    // technologies d'assistance, et le champ qui prend le curseur.
    const open = button("S'inscrire");
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(open.getAttribute('aria-controls')).toBe(
      el().querySelector('.fields')?.getAttribute('id'),
    );

    open.click();
    fixture.detectChanges();

    expect(button("S'inscrire").getAttribute('aria-expanded')).toBe('true');
  });

  it("refuse la création tant que les trois champs n'y sont pas", () => {
    expect(button('Créer mon compte').disabled).toBe(true);

    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    expect(button('Créer mon compte').disabled).toBe(true);

    type(MAIL, 'pierre@brasserie-marchand.fr');
    expect(button('Créer mon compte').disabled).toBe(false);
  });

  it('les trois champs remplis ouvrent le compte', () => {
    fillSignup();
    click('Créer mon compte');

    expect(text()).toContain('Compte actif');
    expect(chrome.kicker()).toBe('Compte créé');
  });

  it('« Déjà client ? » mène à la connexion, et le retour ramène', () => {
    click('Déjà client ?');
    expect(chrome.kicker()).toBe('Connexion');
    expect(text()).toContain('Content de vous revoir.');

    const back = chrome.back();
    expect(back).not.toBeNull();
    back?.();
    fixture.detectChanges();
    expect(text()).toContain('Première visite ?');
  });

  it("le lien envoyé rappelle l'adresse exacte", () => {
    click('Déjà client ?');
    type(0, 'pierre@brasserie-marchand.fr');
    click('Recevoir mon lien');

    expect(text()).toContain('Lien envoyé');
    expect(text()).toContain('pierre@brasserie-marchand.fr');
  });

  it('le créneau « au four » reste affiché, et refuse le doigt', () => {
    click('Demander à être rappelé');

    const closed = Array.from(el().querySelectorAll('button.slot')).find((b) =>
      (b.textContent ?? '').includes('12 h – 14 h'),
    ) as HTMLButtonElement | undefined;

    expect(closed).toBeDefined();
    expect(closed?.textContent).toContain('au four');
    expect(closed?.disabled).toBe(true);
  });

  it("un créneau confirmé remonte dans l'encart pro, et s'annule", () => {
    click('Demander à être rappelé');
    expect(button('Choisissez un moment').disabled).toBe(true);

    click('14 h – 15 h');
    click('Demander le rappel');

    expect(text()).toContain('Rappel demandé · 14 h – 15 h');
    expect(text()).toContain('06 12 44 09 87');

    click('Annuler');
    expect(text()).toContain('Intéressé par l’espace pro ?');
  });
});
