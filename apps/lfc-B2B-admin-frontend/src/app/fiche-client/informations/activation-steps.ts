import type { ActivationPiece } from '@lfd/contracts';
import type { CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import type { ActivationBlocker, AdminCompanyDetail } from '../../comptes-clients/admin-company';

/**
 * Les pièces d'un dossier, plus la condition de règlement qui n'en est pas une,
 * plus les deux **minimums d'ouverture** (`enseigne`, `holder`) — qui ne sont ni
 * l'une ni l'autre : ils précèdent l'existence du compte.
 */
export type StepKey =
  | ActivationPiece
  | 'legal'
  | 'payment'
  | 'enseigne'
  | 'holder'
  /**
   * Le KBIS **déposé mais pas vérifié** : la même pièce, un autre geste. Une
   * clé distincte plutôt qu'un texte conditionnel, parce que ce qui change
   * n'est pas la formulation mais l'action — on ne redemande pas un fichier
   * qui est déjà là, on l'ouvre.
   */
  | 'kbis_verify';

/** Une étape restante, telle que la fiche la présente. */
export interface ActivationStep {
  readonly key: StepKey;
  readonly title: string;
  readonly detail: string;
  readonly cta: string;
}

/** Le texte de chaque étape — écrit une fois, qu'elle soit due ou faite. */
const STEP_TEXTS: Readonly<Record<StepKey, Omit<ActivationStep, 'key'>>> = {
  enseigne: {
    title: "Nom d'usage",
    detail: "Le nom sous lequel le client se reconnaît — c'est le seul champ exigé pour ouvrir.",
    cta: '',
  },
  holder: {
    title: 'Détenteur du compte',
    detail: "La personne qui commande et qui recevra l'accès à l'espace.",
    cta: '',
  },
  legal: {
    title: 'Identité légale',
    detail:
      'Raison sociale, forme juridique ou SIRET manquent — le compte ne peut pas être activé sans eux.',
    cta: "Compléter l'identité",
  },
  tva: {
    title: 'Numéro de TVA',
    detail: 'La forme juridique impose un numéro de TVA intracommunautaire.',
    cta: 'Renseigner la TVA',
  },
  kbis: {
    title: 'Extrait KBIS vérifié',
    detail: "Déposez l'extrait reçu du client, puis confirmez l'avoir vérifié.",
    cta: 'Déposer le KBIS',
  },
  kbis_verify: {
    title: 'Extrait KBIS à vérifier',
    detail:
      "L'extrait est déposé — ouvrez-le, comparez-le à l'identité enregistrée, puis confirmez.",
    cta: "J'ai vérifié cet extrait",
  },
  billing: {
    title: 'Adresse de facturation',
    detail: 'Renseignez l’adresse de facturation.',
    cta: 'Ajouter la facturation',
  },
  delivery: {
    title: 'Adresse de livraison',
    detail: 'Ajoutez au moins un point de livraison.',
    cta: 'Ajouter une livraison',
  },
  payment: {
    title: 'Condition de règlement',
    detail: 'Fixez la condition de règlement convenue.',
    cta: 'Fixer la condition',
  },
};

/**
 * La phrase qui va avec chaque empêchement. **La seule chose que cet écran sait
 * de l'activation** : comment le dire en français.
 *
 * Le verdict, lui, vient du serveur (`company.gate`) — la même fonction qui
 * garde la porte. Cet écran le rejouait, et les deux ont divergé : « Activer le
 * compte » s'allumait sur un KBIS déposé mais non vérifié, et le serveur
 * répondait 409. Un bouton qui promet ce que le serveur refuse est pire qu'un
 * bouton grisé.
 */
const BLOCKER_SENTENCES: Readonly<Record<ActivationBlocker, string>> = {
  identite_legale:
    "Raison sociale, forme juridique et SIRET sont nécessaires : sans eux, il n'y a rien à facturer.",
  telephone: 'Aucun interlocuteur joignable : renseignez au moins un numéro de téléphone.',
  tva: 'Le numéro de TVA intracommunautaire manque.',
  kbis_absent: "L'extrait KBIS n'a pas encore été déposé.",
  kbis_non_verifie:
    "L'extrait KBIS est déposé mais pas encore vérifié : ouvrez-le, comparez-le à l'identité, puis confirmez.",
  facturation: "L'adresse de facturation manque.",
  livraison: 'Aucune adresse de livraison enregistrée.',
};

/** Quelle pièce porte quel empêchement — pour ouvrir la liste sur le bon geste. */
const BLOCKER_STEPS: Readonly<Record<ActivationBlocker, StepKey>> = {
  identite_legale: 'legal',
  telephone: 'legal',
  tva: 'tva',
  kbis_absent: 'kbis',
  kbis_non_verifie: 'kbis_verify',
  facturation: 'billing',
  livraison: 'delivery',
};

/**
 * Ce qu'il manque pour **OUVRIR** — deux champs, pas douze.
 *
 * Un compte s'ouvre avec un nom d'usage et quelqu'un à qui parler ; papiers,
 * adresses et règlement viennent après, et l'agrégat les accepte plus tard
 * (`declare()` n'exige que l'enseigne). Réclamer la liste d'activation complète
 * devant un formulaire vide fait passer pour bloquant ce qui ne l'est pas — et
 * le commercial qui a le client au téléphone renonce à ouvrir « en attendant les
 * papiers », alors que c'est exactement ce que le modèle permet.
 *
 * Les étapes n'ont **aucun geste** : les champs qui les satisfont sont à
 * l'écran, juste dessous.
 */
export function openingSteps(
  identity: CompanyIdentityDraft,
  holderChosen: boolean,
): readonly ActivationStep[] {
  const missing: StepKey[] = [];
  if (identity.enseigne.trim() === '') {
    missing.push('enseigne');
  }
  if (!holderChosen) {
    missing.push('holder');
  }
  return missing.map((key) => ({ key, ...STEP_TEXTS[key] }));
}

/**
 * Ce qu'il **reste** à compléter pour activer — **habillage** du verdict serveur.
 *
 * Aucune règle ici : `company.gate` dit ce qui manque et ce qui bloque, on ne
 * fait que lui donner un titre et un bouton. `null` (compte pas encore ouvert)
 * rend une liste vide — c'est `openingSteps` qui parle à ce moment-là.
 */
export function activationSteps(company: AdminCompanyDetail | null): readonly ActivationStep[] {
  if (company === null) {
    return [];
  }
  // L'identité légale n'est pas une pièce configurable ; elle ouvre la liste
  // quand le serveur la signale (SIRET absent ⇒ rien à facturer).
  const legal: ActivationStep[] = company.gate.blocking.includes('identite_legale')
    ? [{ key: 'legal' as const, ...STEP_TEXTS.legal }]
    : [];

  // Le KBIS déposé mais non vérifié n'appelle pas « déposer » : le fichier est
  // là. Réclamer un dépôt devant une pièce présente envoie chercher ce qui est
  // sous les yeux — c'est le manque le moins devinable du dossier.
  const kbisDeposited = company.gate.blocking.includes('kbis_non_verifie');
  const pieces = company.gate.checklist
    .filter((check) => check.mode !== 'hidden' && !check.done)
    .map((check) => {
      const key: StepKey = check.piece === 'kbis' && kbisDeposited ? 'kbis_verify' : check.piece;
      return { key, ...STEP_TEXTS[key] };
    });

  // La condition de règlement n'est pas une pièce : elle ne « manque » jamais
  // (il y en a toujours une par défaut), elle se CONFIRME. Elle reste donc en
  // fin de liste, toujours.
  return [...legal, ...pieces, { key: 'payment' as const, ...STEP_TEXTS.payment }];
}

/**
 * Ce qui bloque, en **une** phrase : la première, celle qu'on corrigera d'abord.
 * Vide quand rien ne bloque — un bouton grisé muet est une impasse, mais une
 * phrase sous un bouton actif est du bruit.
 */
export function blockedReason(company: AdminCompanyDetail | null): string {
  const first = company?.gate.blocking[0];
  return first === undefined ? '' : BLOCKER_SENTENCES[first];
}

/** L'étape sur laquelle ouvrir quand on clique « pourquoi ça bloque ». */
export function stepForBlocker(blocker: ActivationBlocker): StepKey {
  return BLOCKER_STEPS[blocker];
}
