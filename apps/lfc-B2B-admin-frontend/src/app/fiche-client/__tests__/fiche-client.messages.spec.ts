import type { CompanyMemberInvitedView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { CompanyOpened, HolderOutcome } from '../../comptes-clients/admin-company';
import { accessMessage, openingMessage, trimIdentity } from '../informations/fiche-client.actions';

/** Ce que le serveur répond à l'ouverture, réduit à ce qui change la phrase. */
function opened(holder: HolderOutcome, mailSent: boolean): CompanyOpened {
  return { id: 'cmp_1', holder, mailSent };
}

function invited(mailSent: boolean): CompanyMemberInvitedView {
  return { member: { email: 'lea@comptoir.fr' }, mailSent } as CompanyMemberInvitedView;
}

describe("ce qu'on annonce après une ouverture de compte", () => {
  it('dit que le lien est parti quand il est parti', () => {
    expect(openingMessage(opened('attached', true))).toContain('en route');
  });

  it("N'ARRONDIT PAS un e-mail qui n'est pas parti", () => {
    // Le compte existe, mais personne n'a rien reçu. Un « c'est envoyé ! » de
    // politesse ferait attendre un e-mail qui n'arrivera jamais.
    const message = openingMessage(opened('attached', false));

    expect(message).toContain("l'e-mail n'est pas parti");
    expect(message).toContain('prévenez le client');
  });

  it("distingue l'accès non créé de l'e-mail non parti", () => {
    // Deux pannes différentes, deux rattrapages différents : ici il n'y a même
    // pas d'accès à relancer, il faut le rouvrir.
    expect(openingMessage(opened('failed', false))).toContain('à reprendre depuis sa fiche');
  });

  it("n'annonce AUCUNE panne quand le détenteur a été remis à plus tard", () => {
    // Ouvrir sur la seule enseigne est un choix, pas un incident. Parler de
    // panne à qui vient de choisir d'attendre l'use jusqu'à ce qu'il n'écoute
    // plus les vraies alertes.
    const message = openingMessage(opened('deferred', false));

    expect(message).toContain('Rattachez le détenteur');
    expect(message).not.toContain("n'a pas pu");
    expect(message).not.toContain("l'e-mail n'est pas parti");
  });
});

describe("ce qu'on annonce après une ouverture d'accès", () => {
  it("nomme l'adresse servie, sans rien dire de plus", () => {
    // Une seule phrase, que la personne ait déjà un compte ou non : distinguer
    // les deux cas apprendrait au commercial que cette adresse est déjà cliente
    // ailleurs.
    expect(accessMessage(invited(true))).toBe("C'est envoyé à lea@comptoir.fr.");
  });

  it("dit quand même que l'e-mail n'est pas parti", () => {
    // Ça parle de NOTRE canal, pas de la personne — donc ça se dit toujours.
    expect(accessMessage(invited(false))).toContain("l'e-mail n'est pas parti");
  });
});

describe('rognage de la saisie', () => {
  it('rogne chaque champ de l’identité', () => {
    // Un espace de copier-coller ne doit pas devenir une raison sociale qui ne
    // ressort d'aucune recherche.
    expect(
      trimIdentity({
        raisonSociale: '  Café des Halles SAS ',
        enseigne: ' Le Comptoir  ',
        formeJuridique: ' SAS ',
        siret: ' 81245678900021 ',
        vatNumber: '  ',
      }),
    ).toEqual({
      raisonSociale: 'Café des Halles SAS',
      enseigne: 'Le Comptoir',
      formeJuridique: 'SAS',
      siret: '81245678900021',
      vatNumber: '',
    });
  });
});
