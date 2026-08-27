import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnexionPage } from './connexion-page';

/**
 * L'écran est piloté par le DOM et non par ses signaux : ses membres sont
 * `protected`, et c'est ce que voit la personne qui l'utilise qui compte.
 */
describe('ConnexionPage', () => {
  let fixture: ComponentFixture<ConnexionPage>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const submit = (): HTMLButtonElement | null => el().querySelector('button[type="submit"]');

  const byLabel = (label: string): HTMLButtonElement => {
    const buttons = Array.from(el().querySelectorAll('button'));
    const match = buttons.find((b) => (b.textContent ?? '').includes(label));
    if (!match) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return match;
  };

  const typeEmail = (value: string): void => {
    const input = el().querySelector('input');
    if (!input) {
      throw new Error("Le champ e-mail n'est pas rendu.");
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConnexionPage] });
    fixture = TestBed.createComponent(ConnexionPage);
    fixture.detectChanges();
  });

  it("refuse l'envoi tant que l'adresse n'est pas plausible", () => {
    expect(submit()?.disabled).toBe(true);

    typeEmail('pierre@');
    expect(submit()?.disabled).toBe(true);

    typeEmail('pierre@brasserie-marchand.fr');
    expect(submit()?.disabled).toBe(false);
  });

  it("annonce le lien envoyé, et rappelle l'adresse exacte", () => {
    typeEmail('pierre@brasserie-marchand.fr');
    byLabel('Recevoir mon lien').click();
    fixture.detectChanges();

    expect(text()).toContain('Lien envoyé');
    expect(text()).toContain('pierre@brasserie-marchand.fr');
  });

  it("garde l'adresse quand on revient la corriger", () => {
    typeEmail('pierre@brasserie-marchand.fr');
    byLabel('Recevoir mon lien').click();
    fixture.detectChanges();

    byLabel("Changer d'adresse").click();
    fixture.detectChanges();

    expect(el().querySelector('input')?.value).toBe('pierre@brasserie-marchand.fr');
  });

  it('le renvoi le dit — sinon le clic serait muet', () => {
    typeEmail('pierre@brasserie-marchand.fr');
    byLabel('Recevoir mon lien').click();
    fixture.detectChanges();

    expect(text()).not.toContain('nouveau lien');

    byLabel('Renvoyer').click();
    fixture.detectChanges();

    expect(text()).toContain('Un nouveau lien vient de partir.');
  });

  it('le clic sur le lien fait entrer', () => {
    typeEmail('pierre@brasserie-marchand.fr');
    byLabel('Recevoir mon lien').click();
    fixture.detectChanges();

    byLabel('Simuler le clic sur le lien').click();
    fixture.detectChanges();

    expect(text()).toContain('Vous êtes connecté.');
    expect(text()).toContain('Compte reconnu');
  });
});
