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
  | 'enseigne'
  | 'holder'
  /**
   * Un **numéro joignable**, sur le détenteur ou sur n'importe quel
   * interlocuteur. Le serveur en fait un empêchement (`telephone`) ; l'écran
   * n'en disait rien. Le rail comptait donc un point de plus que la liste n'en
   * montrait, et le manquant n'était jamais nommé — sauf à être le premier.
   */
  | 'telephone'
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
  /**
   * Cette étape **empêche-t-elle** l'activation ?
   *
   * Faux pour une pièce `optional` en réglages : on la réclame, elle ne bloque
   * pas. La liste les mélangeait sans le dire, et un dossier auquel il ne
   * manquait qu'une pièce facultative montrait des lignes au-dessus d'un bouton
   * ACTIF — de quoi douter de la porte, alors que le réglage disait cela.
   */
  readonly blocking: boolean;
}

/** Le texte de chaque étape — écrit une fois, qu'elle soit due ou faite. */
const STEP_TEXTS: Readonly<Record<StepKey, Omit<ActivationStep, 'key' | 'blocking'>>> = {
  enseigne: {
    // Le titre reprend MOT POUR MOT l'étiquette du champ. Un synonyme, même
    // meilleur, oblige le lecteur à traduire avant de chercher.
    title: 'Enseigne',
    detail: "Le nom sous lequel le client se reconnaît — c'est le seul champ exigé pour ouvrir.",
    cta: '',
  },
  holder: {
    title: 'Détenteur du compte',
    detail:
      "La personne qui commande et qui recevra l'accès à l'espace. Son adresse suffit : si elle est déjà cliente, cette société rejoindra l'espace qu'elle a.",
    cta: 'Rattacher le détenteur',
  },
  telephone: {
    title: 'Numéro joignable',
    detail:
      'Un livreur qui cherche la porte doit pouvoir appeler. Le détenteur ou un interlocuteur, peu importe lequel.',
    cta: 'Ajouter un numéro',
  },
  legal: {
    title: 'Identité légale',
    detail:
      'Raison sociale, forme juridique ou SIRET manquent — le compte ne peut pas être activé sans eux.',
    cta: "Compléter l'identité",
  },
  tva: {
    title: 'Numéro de TVA',
    // Ne s'appuie PAS sur la forme juridique : elle peut manquer, et manque
    // souvent — la ligne « Identité légale » juste au-dessus le dit alors dans
    // la même liste. Justifier une obligation par une donnée absente fait se
    // contredire deux lignes voisines.
    detail: 'Un numéro de TVA intracommunautaire est requis pour ce compte.',
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
  detenteur:
    "Aucun détenteur rattaché : personne ne pourrait se connecter à cet espace. Renseignez l'adresse de la personne qui commande.",
  telephone: 'Aucun interlocuteur joignable : renseignez au moins un numéro de téléphone.',
  tva: 'Le numéro de TVA intracommunautaire manque.',
  kbis_absent: "L'extrait KBIS n'a pas encore été déposé.",
  kbis_non_verifie:
    "L'extrait KBIS est déposé mais pas encore vérifié : ouvrez-le, comparez-le à l'identité, puis confirmez.",
  facturation: "L'adresse de facturation manque.",
  livraison: 'Aucune adresse de livraison enregistrée.',
};

/**
 * Ce qu'il manque pour **OUVRIR** — un champ, pas douze.
 *
 * Un compte s'ouvre avec un nom d'usage, et rien d'autre : papiers, adresses,
 * règlement et **détenteur** viennent après (`declare()` n'exige que
 * l'enseigne). Réclamer la liste d'activation complète devant un formulaire
 * vide fait passer pour bloquant ce qui ne l'est pas — et le commercial qui a le
 * client au téléphone renonce à ouvrir « en attendant », alors que c'est
 * exactement ce que le modèle permet.
 *
 * Le détenteur n'y figure plus : il se saisit ici quand on l'a, et se rattache
 * depuis la fiche quand on ne l'a pas encore. Il redevient exigible à
 * l'**activation** — c'est le serveur qui le dit alors (`detenteur`).
 *
 * L'étape n'a **aucun geste** : le champ qui la satisfait est à l'écran, juste
 * dessous.
 */
export function openingSteps(identity: CompanyIdentityDraft): readonly ActivationStep[] {
  if (identity.enseigne.trim() !== '') {
    return [];
  }
  return [{ key: 'enseigne', ...STEP_TEXTS.enseigne, blocking: true }];
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
    ? [{ key: 'legal' as const, ...STEP_TEXTS.legal, blocking: true }]
    : [];

  // Le détenteur non plus n'est pas une pièce configurable : un compte actif
  // sans personne à qui ouvrir l'espace est un compte dont la porte est murée.
  const holder: ActivationStep[] = company.gate.blocking.includes('detenteur')
    ? [{ key: 'holder' as const, ...STEP_TEXTS.holder, blocking: true }]
    : [];

  // Le téléphone n'est pas une pièce configurable non plus. Il ne se réclame
  // qu'une fois le détenteur là : devant un compte sans personne, « ajoutez un
  // numéro » réclamerait le numéro de personne — le serveur bloque sur les deux,
  // mais l'écran ne fait faire qu'un geste à la fois.
  const phone: ActivationStep[] =
    holder.length === 0 && company.gate.blocking.includes('telephone')
      ? [{ key: 'telephone' as const, ...STEP_TEXTS.telephone, blocking: true }]
      : [];

  // Le KBIS déposé mais non vérifié n'appelle pas « déposer » : le fichier est
  // là. Réclamer un dépôt devant une pièce présente envoie chercher ce qui est
  // sous les yeux — c'est le manque le moins devinable du dossier.
  const kbisDeposited = company.gate.blocking.includes('kbis_non_verifie');
  const pieces = company.gate.checklist
    .filter((check) => check.mode !== 'hidden' && !check.done)
    .map((check) => {
      const key: StepKey = check.piece === 'kbis' && kbisDeposited ? 'kbis_verify' : check.piece;
      // Seul le mode `required` oppose un empêchement — c'est la même lecture
      // que fait le serveur pour remplir `gate.blocking`.
      return { key, ...STEP_TEXTS[key], blocking: check.mode === 'required' };
    });

  // **Pas de « condition de règlement » ici.** Elle ne manque jamais — payer à
  // la commande est le socle, offert à tous — et son bouton n'ouvrait rien. Une
  // ligne d'avertissement permanente, sur une exigence qui n'existe pas, avec un
  // geste qui ne fait rien : elle apprenait à ignorer l'encart entier.
  return [...legal, ...holder, ...phone, ...pieces];
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
