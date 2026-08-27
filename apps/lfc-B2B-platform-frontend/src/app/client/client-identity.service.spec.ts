import { TestBed } from '@angular/core/testing';

import type { UserProfile } from '../account/account.model';
import { ClientIdentity } from './client-identity.service';
import { MOCK_CLIENT } from './mock-client';

const PROFILE: UserProfile = {
  userId: 'usr_1',
  subject: 'auth0|1',
  firstName: 'Camille',
  lastName: 'Vallet',
  email: 'camille@chalet-barmettes.fr',
  phone: '06 11 22 33 44',
};

describe('ClientIdentity', () => {
  let identity: ClientIdentity;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    identity = TestBed.inject(ClientIdentity);
  });

  it('répond avec la maquette tant que personne n’est reconnu', () => {
    // La démo doit rester jouable déconnecté : un écran qui dit « Bonjour »
    // sans nom serait pire qu'un nom d'exemple.
    expect(identity.firstName()).toBe(MOCK_CLIENT.firstName);
    expect(identity.phone()).toBe(MOCK_CLIENT.phone);
  });

  it('prend le vrai nom dès que le compte est connu', () => {
    identity.apply(PROFILE);

    expect(identity.firstName()).toBe('Camille');
    expect(identity.fullName()).toBe('Camille Vallet');
    expect(identity.phone()).toBe('06 11 22 33 44');
    expect(identity.email()).toBe('camille@chalet-barmettes.fr');
  });

  it('un champ VIDE n’est pas une réponse — le compte naît sans nom', () => {
    // Le backend provisionne l'utilisateur au premier appel authentifié, avant
    // que `/bienvenue` n'ait reposé quoi que ce soit. Sans cette garde, l'écran
    // dirait « Bonjour  » pendant ce battement.
    identity.apply({ ...PROFILE, firstName: '', lastName: '', email: '', phone: '   ' });

    expect(identity.firstName()).toBe(MOCK_CLIENT.firstName);
    expect(identity.phone()).toBe(MOCK_CLIENT.phone);
  });

  it('reconnu SANS profil : aucun nom d’emprunt, on salue sans nommer', () => {
    // « Bonjour Pierre » à quelqu'un de connecté n'est pas un repli : c'est le
    // nom d'un autre, et ça masque un profil qui n'est jamais arrivé.
    identity.setRecognised(true);

    expect(identity.firstName()).toBeNull();
    expect(identity.phone()).toBeNull();
    expect(identity.email()).toBeNull();
  });

  it('reconnu AVEC profil : c’est le compte qui parle', () => {
    identity.setRecognised(true);
    identity.apply(PROFILE);

    expect(identity.firstName()).toBe('Camille');
  });

  it('sans nom de famille, le nom complet ne traîne pas d’espace', () => {
    identity.apply({ ...PROFILE, lastName: '' });

    expect(identity.fullName()).toBe('Camille');
  });
});
