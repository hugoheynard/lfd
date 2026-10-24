import type { CollectionProcedureStepKeyView } from '@lfd/contracts';

/**
 * Le paramètre `?onglet=` du détail d'une procédure : un lien venu d'ailleurs
 * (la fiche d'une entité) choisit l'onglet d'arrivée. Sans lui, ou avec une
 * valeur inconnue, c'est `arrivalStep` du serveur qui décide — le paramètre
 * ne déverrouille rien : un onglet verrouillé s'ouvre verrouillé.
 *
 * Les valeurs sont en français : elles se lisent dans la barre d'adresse.
 */
export const PROCEDURE_TAB_PARAM = 'onglet';

export type ProcedureTabParam = 'comptes' | 'mandats' | 'factures' | 'fichier' | 'retours';

const TAB_OF_PARAM: Readonly<Record<ProcedureTabParam, CollectionProcedureStepKeyView>> = {
  comptes: 'accounts',
  mandats: 'mandates',
  factures: 'invoices',
  fichier: 'file',
  retours: 'returns',
};

/** L'onglet que demande l'adresse ; `null` = laisser le serveur choisir. */
export function requestedTab(param: string | null): CollectionProcedureStepKeyView | null {
  return isTabParam(param) ? TAB_OF_PARAM[param] : null;
}

function isTabParam(param: string | null): param is ProcedureTabParam {
  return param !== null && Object.hasOwn(TAB_OF_PARAM, param);
}
