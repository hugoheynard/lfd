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
  { piece: 'vat', blocking: true, done: false },
  { piece: 'kbis', blocking: false, done: false },
  { piece: 'billing', blocking: true, done: false },
];

function withGate(
  gate: Partial<ActivationGate>,
  over: Partial<AdminCompanyDetail> = {},
): AdminCompanyDetail {
  return {
    kbis: null,
    ...over,
    gate: { canActivate: false, blocking: [], checklist: ALL_TODO, ...gate },
  } as AdminCompanyDetail;
}

/** Un extrait déposé, pas encore vérifié — le cas qui change le geste. */
const DEPOSITED = { kbis: { certified: false } } as Partial<AdminCompanyDetail>;

describe('la fiche HABILLE le verdict du serveur, elle ne le rejoue pas', () => {
  it('liste les pièces que le serveur dit non faites, et RIEN d’autre', () => {
    // Pas de « condition de règlement » : elle ne manque jamais (payer à la
    // commande est le socle) et son bouton n'ouvrait rien. Une ligne permanente
    // avec un geste mort apprend à ignorer l'encart entier.
    const steps = activationSteps(withGate({}));

    expect(steps.map((step) => step.key)).toEqual(['vat', 'kbis', 'billing']);
  });

  it('tait une pièce faite, et garde celle qui ne bloque pas', () => {
    const steps = activationSteps(
      withGate({
        checklist: [
          { piece: 'vat', blocking: true, done: true },
          { piece: 'kbis', blocking: false, done: false },
          { piece: 'billing', blocking: false, done: false },
        ],
      }),
    );

    // Non bloquante reste demandée — « pas bloquante » n'est pas « pas demandée ».
    expect(steps.map((step) => step.key)).toEqual(['kbis', 'billing']);
  });

  it("ouvre la liste sur l'identité légale quand le serveur la signale", () => {
    const steps = activationSteps(withGate({ blocking: ['identite_legale'] }));

    expect(steps[0]?.key).toBe('legal');
  });

  it('réclame le NUMÉRO que le serveur exige, au lieu de le taire', () => {
    // Le rail compte les empêchements (`gate.blocking`), la liste montrait les
    // pièces : un dossier complet sans téléphone affichait « 1 point à régler »
    // au-dessus de zéro ligne, et le manquant n'était nommé nulle part.
    const complet: readonly ActivationCheck[] = [
      { piece: 'vat', blocking: true, done: true },
      { piece: 'kbis', blocking: false, done: true },
      { piece: 'billing', blocking: true, done: true },
    ];
    const steps = activationSteps(withGate({ blocking: ['telephone'], checklist: complet }));

    expect(steps.map((step) => step.key)).toEqual(['telephone']);
    expect(steps[0]?.cta).toBe('Ajouter un numéro');
  });

  it('ne réclame pas le numéro de quelqu’un qui n’existe pas encore', () => {
    // Sans détenteur, le serveur bloque sur les DEUX. L'écran ne fait faire
    // qu'un geste à la fois : rattacher d'abord, appeler ensuite.
    const steps = activationSteps(withGate({ blocking: ['detenteur', 'telephone'] }));

    expect(steps.map((step) => step.key)).not.toContain('telephone');
    expect(steps[0]?.key).toBe('holder');
  });

  it('distingue la pièce qui BLOQUE de celle qu’on réclame seulement', () => {
    // Le KBIS ne bloque jamais : c'est une convention interne, il se réclame
    // sans empêcher d'activer. La liste les affichait à
    // l'identique, et un bouton actif au-dessus passait pour un trou.
    const steps = activationSteps(
      withGate({
        blocking: ['vat'],
        checklist: [
          { piece: 'vat', blocking: true, done: false },
          { piece: 'kbis', blocking: false, done: false },
          { piece: 'billing', blocking: true, done: true },
        ],
      }),
    );

    expect(steps.find((step) => step.key === 'vat')?.blocking).toBe(true);
    expect(steps.find((step) => step.key === 'kbis')?.blocking).toBe(false);
  });

  it('ne dit rien devant un compte pas encore ouvert', () => {
    expect(activationSteps(null)).toEqual([]);
  });

  it('dit ce qui bloque EN PREMIER, pas la liste entière', () => {
    // Une phrase sous un bouton, pas un rapport : on corrige dans cet ordre.
    const reason = blockedReason(withGate({ blocking: ['telephone', 'facturation'] }));

    expect(reason).toContain('Aucun interlocuteur joignable');
  });

  it("change de geste quand l'extrait est là mais pas vérifié", () => {
    // « Déposer le KBIS » devant un fichier déjà déposé envoie chercher ce qui
    // est sous les yeux. Le geste attendu n'est pas un dépôt, c'est une lecture.
    // La présence se lit sur la FICHE : le verdict ne la distingue plus, le
    // KBIS ne bloquant plus rien.
    const steps = activationSteps(withGate({}, DEPOSITED));
    const kbis = steps.find((step) => step.key.startsWith('kbis'));

    expect(kbis?.key).toBe('kbis_verify');
    expect(kbis?.cta).toBe("J'ai vérifié cet extrait");
    expect(kbis?.title).toContain('à vérifier');
  });

  it('redemande un DÉPÔT quand rien n’a été déposé', () => {
    const steps = activationSteps(withGate({}));
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
          { piece: 'vat', blocking: true, done: true },
          { piece: 'kbis', blocking: false, done: true },
          { piece: 'billing', blocking: true, done: true },
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

  it('ne réclame QUE le nom d’usage', () => {
    // Un compte s'ouvre SANS papiers ET sans détenteur — c'est tout l'intérêt du
    // parcours au comptoir. Réclamer KBIS, adresses ou l'adresse du gérant ici
    // ferait renoncer à ouvrir pendant que le client est au téléphone.
    expect(openingSteps(EMPTY).map((step) => step.key)).toEqual(['enseigne']);
  });

  it('ne propose AUCUN geste : le champ est déjà à l’écran', () => {
    // Un bouton qui ne mène nulle part est pire qu'une absence de bouton.
    expect(openingSteps(EMPTY).every((step) => step.cta === '')).toBe(true);
  });

  it('se vide dès que le nom d’usage est saisi, détenteur ou pas', () => {
    expect(openingSteps({ ...EMPTY, enseigne: 'Chez Milo' })).toEqual([]);
  });
});

describe('Aucune étape ne justifie une exigence par une donnée absente', () => {
  /**
   * La ligne TVA disait « La forme juridique impose un numéro de TVA
   * intracommunautaire » — alors que la ligne « Identité légale », deux lignes
   * plus haut dans la MÊME liste, annonce que la forme juridique manque. Deux
   * voisines qui se contredisent : l'une constate l'absence, l'autre s'appuie
   * dessus. Constaté à l'écran en production le 2026-08-13.
   */
  it('ne fait pas reposer la TVA sur la forme juridique', () => {
    const steps = activationSteps(withGate({ blocking: ['identite_legale'] }));
    const vat = steps.find((step) => step.key === 'vat');

    expect(vat).toBeDefined();
    expect(vat?.detail).not.toMatch(/forme juridique/i);
  });
});
