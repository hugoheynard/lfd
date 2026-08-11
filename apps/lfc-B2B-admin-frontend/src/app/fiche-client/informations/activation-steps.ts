import type { ActivationPiece, PlatformSettings } from '@lfd/contracts';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/** Les pièces d'un dossier, plus la condition de règlement qui n'en est pas une. */
export type StepKey = ActivationPiece | 'legal' | 'payment';

/** Une étape restante, telle que la fiche la présente. */
export interface ActivationStep {
  readonly key: StepKey;
  readonly title: string;
  readonly detail: string;
  readonly cta: string;
}

/** Le texte de chaque étape — écrit une fois, qu'elle soit due ou faite. */
const STEP_TEXTS: Readonly<Record<StepKey, Omit<ActivationStep, 'key'>>> = {
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
    title: 'Extrait KBIS',
    detail: "Déposez l'extrait KBIS reçu du client.",
    cta: 'Déposer le KBIS',
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

/** Ordre de présentation — celui dans lequel on les réclame au client. */
const PIECES: readonly ActivationPiece[] = ['tva', 'kbis', 'billing', 'delivery'];

/**
 * Ce qu'il **reste** à compléter (pur).
 *
 * `company` à `null` signifie « rien n'est encore là » : c'est le cas du compte
 * qu'on est en train d'ouvrir, et c'est ce qui permet à la page de création de
 * montrer **la même** synthèse que la fiche, complète, plutôt qu'un écran vide
 * qui ferait croire qu'il n'y a rien à demander.
 *
 * Une pièce `hidden` en configuration est retirée : on ne réclame pas ce qui
 * n'existe pas dans le service (la livraison, quand il n'y a que du retrait).
 * `settings` à `null` — réglage illisible — rend une liste vide plutôt que de
 * réclamer des pièces peut-être désactivées.
 */
export function activationSteps(
  company: AdminCompanyDetail | null,
  settings: PlatformSettings | null,
): readonly ActivationStep[] {
  if (settings === null) {
    return [];
  }
  // L'identité légale n'est pas une pièce configurable : sans SIRET, il n'y a
  // rien à facturer. Elle ouvre donc la liste, et ne se désactive pas.
  const legal: ActivationStep[] = hasLegalIdentity(company)
    ? []
    : [{ key: 'legal' as const, ...STEP_TEXTS.legal }];

  const steps = PIECES.filter(
    (piece) => settings[piece] !== 'hidden' && !isPieceDone(company, piece),
  ).map((piece) => ({ key: piece, ...STEP_TEXTS[piece] }));

  // La condition de règlement n'est pas une pièce : elle ne « manque » jamais
  // (il y en a toujours une par défaut), elle se CONFIRME. Elle reste donc en
  // fin de liste, toujours.
  return [...legal, ...steps, { key: 'payment' as const, ...STEP_TEXTS.payment }];
}

/**
 * Les pièces **requises** encore absentes — miroir du gate serveur d'activation.
 *
 * Un compte qui n'existe pas encore ne s'active pas : `company` à `null` rend la
 * liste des pièces requises, ce qui interdit le CTA d'activation.
 */
export function missingRequiredPieces(
  company: AdminCompanyDetail | null,
  settings: PlatformSettings | null,
): readonly ActivationPiece[] {
  if (settings === null) {
    return [];
  }
  return PIECES.filter((piece) => settings[piece] === 'required' && !isPieceDone(company, piece));
}

/** Une pièce est-elle là ? Sans société, aucune ne l'est. */
function isPieceDone(company: AdminCompanyDetail | null, piece: ActivationPiece): boolean {
  if (company === null) {
    return false;
  }
  switch (piece) {
    case 'tva':
      // Non assujetti : la pièce n'a pas lieu d'être, donc elle ne manque pas.
      return !company.vatNumberRequired || company.tvaIntracom.trim() !== '';
    case 'kbis':
      return company.kbis !== null;
    case 'billing':
      return company.addresses.billing !== null;
    case 'delivery':
      return company.addresses.deliveries.length > 0;
  }
}

/**
 * L'identité **du greffe** est-elle au complet ? Elle n'est pas une pièce
 * configurable : sans elle, il n'y a rien à facturer, et le serveur refuse
 * d'activer. L'enseigne n'en fait pas partie — c'est le nom d'usage, exigé dès
 * l'ouverture.
 */
export function hasLegalIdentity(company: AdminCompanyDetail | null): boolean {
  return (
    company !== null &&
    company.raisonSociale.trim() !== '' &&
    company.formeJuridique.trim() !== '' &&
    company.siret.trim() !== ''
  );
}

/**
 * Y a-t-il **quelqu'un à appeler** ? Au moins un interlocuteur avec un numéro.
 *
 * Ce n'est pas une pièce administrative, c'est la condition d'une livraison :
 * activer une société qu'on ne peut pas joindre, c'est envoyer un camion devant
 * une porte fermée sans pouvoir prévenir. Le serveur refuse ; l'écran doit dire
 * la même chose que lui, jamais mieux.
 */
export function isReachable(company: AdminCompanyDetail | null): boolean {
  return company !== null && company.contacts.some((contact) => contact.phone.trim() !== '');
}
