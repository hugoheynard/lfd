import type { CompanyMemberInvitedView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { CompanyOpened } from '../../comptes-clients/admin-company';
import { accessMessage, openingMessage, trimIdentity } from '../informations/fiche-client.actions';

/** Ce que le serveur répond à l'ouverture, réduit à ce qui change la phrase. */
function opened(accessOpened: boolean, mailSent: boolean): CompanyOpened {
  return { id: 'cmp_1', accessOpened, mailSent } as CompanyOpened;
}

function invited(mailSent: boolean): CompanyMemberInvitedView {
  return { member: { email: 'lea@comptoir.fr' }, mailSent } as CompanyMemberInvitedView;
}

describe("ce qu'on annonce après une ouverture de compte", () => {
  it('dit que le lien est parti quand il est parti', () => {
    expect(openingMessage(opened(true, true))).toContain('en route');
  });

  it("N'ARRONDIT PAS un e-mail qui n'est pas parti", () => {
    // Le compte existe, mais personne n'a rien reçu. Un « c'est envoyé ! » de
    // politesse ferait attendre un e-mail qui n'arrivera jamais.
    const message = openingMessage(opened(true, false));

    expect(message).toContain("l'e-mail n'est pas parti");
    expect(message).toContain('prévenez le client');
  });

  it("distingue l'accès non créé de l'e-mail non parti", () => {
    // Deux pannes différentes, deux rattrapages différents : ici il n'y a même
    // pas d'accès à relancer, il faut le rouvrir.
    expect(openingMessage(opened(false, false))).toContain('à reprendre depuis sa fiche');
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
        tvaIntracom: '  ',
      }),
    ).toEqual({
      raisonSociale: 'Café des Halles SAS',
      enseigne: 'Le Comptoir',
      formeJuridique: 'SAS',
      siret: '81245678900021',
      tvaIntracom: '',
    });
  });
});
