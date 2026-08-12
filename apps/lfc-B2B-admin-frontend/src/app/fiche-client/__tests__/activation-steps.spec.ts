import { describe, expect, it } from 'vitest';

import type {
  ActivationCheck,
  ActivationGate,
  AdminCompanyDetail,
} from '../../comptes-clients/admin-company';
import { activationSteps, blockedReason, openingSteps } from '../informations/activation-steps';

/**
 * Ces tests ne vérifient plus **la règle** — elle vit côté serveur, dans
 * `activationGate`, et n'est plus écrite qu'une fois. Ils vérifient
 * l'**habillage** : un verdict donné produit-il la bonne liste et la bonne
 * phrase. C'est tout ce que cet écran a encore le droit de savoir.
 */
const ALL_TODO: readonly ActivationCheck[] = [
  { piece: 'tva', mode: 'required', done: false },
  { piece: 'kbis', mode: 'required', done: false },
  { piece: 'billing', mode: 'required', done: false },
  { piece: 'delivery', mode: 'required', done: false },
];

function withGate(gate: Partial<ActivationGate>): AdminCompanyDetail {
  return {
    gate: { canActivate: false, blocking: [], checklist: ALL_TODO, ...gate },
  } as AdminCompanyDetail;
}

describe('la fiche HABILLE le verdict du serveur, elle ne le rejoue pas', () => {
  it('liste les pièces que le serveur dit non faites, et RIEN d’autre', () => {
    // Pas de « condition de règlement » : elle ne manque jamais (payer à la
    // commande est le socle) et son bouton n'ouvrait rien. Une ligne permanente
    // avec un geste mort apprend à ignorer l'encart entier.
    const steps = activationSteps(withGate({}));

    expect(steps.map((step) => step.key)).toEqual(['tva', 'kbis', 'billing', 'delivery']);
  });

  it('tait une pièce faite, et une pièce masquée en réglages', () => {
    const steps = activationSteps(
      withGate({
        checklist: [
          { piece: 'tva', mode: 'required', done: true },
          { piece: 'kbis', mode: 'hidden', done: false },
          { piece: 'billing', mode: 'optional', done: false },
          { piece: 'delivery', mode: 'required', done: false },
        ],
      }),
    );

    // `optional` reste demandée — « pas bloquante » n'est pas « pas demandée ».
    expect(steps.map((step) => step.key)).toEqual(['billing', 'delivery']);
  });

  it("ouvre la liste sur l'identité légale quand le serveur la signale", () => {
    const steps = activationSteps(withGate({ blocking: ['identite_legale'] }));

    expect(steps[0]?.key).toBe('legal');
  });

  it('ne dit rien devant un compte pas encore ouvert', () => {
    expect(activationSteps(null)).toEqual([]);
  });

  it('dit ce qui bloque EN PREMIER, pas la liste entière', () => {
    // Une phrase sous un bouton, pas un rapport : on corrige dans cet ordre.
    const reason = blockedReason(withGate({ blocking: ['telephone', 'kbis_absent'] }));

    expect(reason).toContain('Aucun interlocuteur joignable');
  });

  it('distingue le KBIS absent du KBIS non vérifié', () => {
    // Le cas le moins devinable : la pièce est là, personne ne l'a ouverte.
    expect(blockedReason(withGate({ blocking: ['kbis_non_verifie'] }))).toContain(
      'déposé mais pas encore vérifié',
    );
    expect(blockedReason(withGate({ blocking: ['kbis_absent'] }))).toContain(
      "n'a pas encore été déposé",
    );
  });

  it("change de geste quand l'extrait est là mais pas vérifié", () => {
    // « Déposer le KBIS » devant un fichier déjà déposé envoie chercher ce qui
    // est sous les yeux. Le geste attendu n'est pas un dépôt, c'est une lecture.
    const steps = activationSteps(withGate({ blocking: ['kbis_non_verifie'] }));
    const kbis = steps.find((step) => step.key.startsWith('kbis'));

    expect(kbis?.key).toBe('kbis_verify');
    expect(kbis?.cta).toBe("J'ai vérifié cet extrait");
    expect(kbis?.title).toContain('à vérifier');
  });

  it('redemande un DÉPÔT quand rien n’a été déposé', () => {
    const steps = activationSteps(withGate({ blocking: ['kbis_absent'] }));
    const kbis = steps.find((step) => step.key.startsWith('kbis'));

    expect(kbis?.key).toBe('kbis');
    expect(kbis?.cta).toBe('Déposer le KBIS');
  });

  it('ne propose JAMAIS de « fixer la condition de règlement »', () => {
    // Elle ne manque jamais, et son bouton n'ouvrait aucun panneau. Le test
    // existe pour que la ligne ne revienne pas par habitude.
    const complet = activationSteps(
      withGate({
        checklist: [
          { piece: 'tva', mode: 'required', done: true },
          { piece: 'kbis', mode: 'required', done: true },
          { piece: 'billing', mode: 'required', done: true },
          { piece: 'delivery', mode: 'required', done: true },
        ],
      }),
    );

    expect(complet).toEqual([]);
  });

  it('se tait quand rien ne bloque', () => {
    expect(blockedReason(withGate({ canActivate: true }))).toBe('');
    expect(blockedReason(null)).toBe('');
  });
});

describe("ce qu'il faut pour OUVRIR n'est pas ce qu'il faut pour ACTIVER", () => {
  const EMPTY = {
    raisonSociale: '',
    enseigne: '',
    formeJuridique: '',
    siret: '',
    tvaIntracom: '',
  };

  it('ne réclame que le nom d’usage et le détenteur', () => {
    // Un compte s'ouvre SANS papiers — c'est tout l'intérêt du parcours au
    // comptoir. Réclamer KBIS et adresses ici ferait renoncer à ouvrir.
    expect(openingSteps(EMPTY, false).map((step) => step.key)).toEqual(['enseigne', 'holder']);
  });

  it('ne propose AUCUN geste : les champs sont déjà à l’écran', () => {
    // Un bouton qui ne mène nulle part est pire qu'une absence de bouton.
    expect(openingSteps(EMPTY, false).every((step) => step.cta === '')).toBe(true);
  });

  it('se vide dès que le minimum est saisi', () => {
    expect(openingSteps({ ...EMPTY, enseigne: 'Chez Milo' }, true)).toEqual([]);
  });

  it('ne retient QUE ce qui manque encore', () => {
    expect(openingSteps({ ...EMPTY, enseigne: 'Chez Milo' }, false).map((s) => s.key)).toEqual([
      'holder',
    ]);
  });
});
