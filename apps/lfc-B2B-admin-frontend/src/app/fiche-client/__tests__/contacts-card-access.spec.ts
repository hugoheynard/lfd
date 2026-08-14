import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompanyContactsCard, type CompanyContactCardView } from '@lfd/b2b-ui/company';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Ce que la carte **dit de l'accès** — la moitié visible de « le contact est
 * l'unité, l'accès est un état ».
 *
 * On rend le composant partagé plutôt que de tester la projection : le risque
 * n'est pas dans le mapping (couvert ailleurs), il est d'afficher « Compte
 * créé » à quelqu'un qui n'en a pas.
 */
function card(over: Partial<CompanyContactCardView> = {}): CompanyContactCardView {
  return {
    contactId: 'ct_1',
    firstName: 'Léa',
    lastName: 'Martin',
    role: 'Commandes',
    fonction: '',
    email: 'lea@exemple.fr',
    phone: '',
    isPrimary: false,
    isYou: false,
    access: 'none',
    emailVerified: false,
    ...over,
  };
}

@Component({
  imports: [CompanyContactsCard],
  template: `<lfd-company-contacts-card [contacts]="contacts()" [canManage]="true" />`,
})
class Host {
  readonly contacts: WritableSignal<readonly CompanyContactCardView[]> = signal([card()]);
}

function render(contacts: readonly CompanyContactCardView[]): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.contacts.set(contacts);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('carte contacts — état de l’accès', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('propose de créer l’accès de qui n’en a pas', () => {
    const host = render([card({ access: 'none' })]);

    expect(host.textContent).toContain("n'a pas d'accès");
    expect(host.textContent).toContain("Créer l'accès");
    // Aucun tick : il n'y a rien à cocher.
    expect(host.querySelectorAll('.tick')).toHaveLength(0);
  });

  it('coche le compte, pas l’e-mail, tant que le lien n’a pas été suivi', () => {
    const host = render([card({ access: 'invited', emailVerified: false })]);

    const ticks = host.querySelectorAll('.tick');
    expect(ticks).toHaveLength(2);
    expect(ticks[0]?.classList.contains('is-done')).toBe(true);
    expect(ticks[1]?.classList.contains('is-done')).toBe(false);
    // `invited` est un état utile : il dit s'il faut renvoyer ou rappeler.
    expect(host.textContent).toContain('Renvoyer le lien');
  });

  it('coche les deux quand l’adresse a été prouvée', () => {
    const host = render([card({ access: 'active', emailVerified: true })]);

    const ticks = host.querySelectorAll('.tick');
    expect(ticks).toHaveLength(2);
    expect(Array.from(ticks).every((tick) => tick.classList.contains('is-done'))).toBe(true);
    expect(host.textContent).not.toContain('Renvoyer le lien');
  });

  it('ne dit RIEN quand la vue ignore l’accès', () => {
    // `null` n'est pas `'none'` : afficher « pas d'accès » serait une
    // affirmation que cet écran ne peut pas soutenir.
    const host = render([card({ access: null })]);

    expect(host.querySelectorAll('.tick')).toHaveLength(0);
    expect(host.textContent).not.toContain("n'a pas d'accès");
  });

  it('dit le vide au lieu de ne rien afficher', () => {
    // Un compte ouvert à l'enseigne seule n'a AUCUN contact. La section
    // n'affichait alors qu'un titre et sa promesse — « le contact principal de
    // l'entreprise, et vos interlocuteurs » — au-dessus de rien du tout.
    const host = render([]);

    expect(host.textContent).toContain('Aucun contact enregistré');
  });

  it('laisse ouvrir l’accès du DÉTENTEUR, qui n’a pas d’identifiant de contact', () => {
    // C'est le rattrapage du compte ouvert pendant que le fournisseur
    // d'identité était injoignable : le détenteur est là, sans accès.
    const host = render([card({ contactId: null, isPrimary: true, access: 'none' })]);

    expect(host.textContent).toContain("Créer l'accès");
  });
});
