import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le suivi des corrections d'accessibilité**, sous la déclaration
 * d'accessibilité (Hugo, 2026-10-26).
 *
 * Un fichier d'écran et non une clé du dictionnaire général : le suivi se
 * charge avec le dialogue de la mention `accessibility`, jamais au démarrage,
 * et ses textes suivent le même chemin.
 *
 * Aucun texte ne parle de taux : l'audit n'est pas fait, et Hugo a décidé
 * qu'aucun taux ne se publie avant.
 */
export interface AccessibilityFollowUpCopy {
  readonly title: string;
  /** Le nom du tableau pour un lecteur d'écran (`<caption>`). */
  readonly caption: string;
  readonly columnTheme: string;
  readonly columnCorrection: string;
  readonly columnDate: string;
  readonly columnStatus: string;
  readonly correctionDone: string;
  readonly correctionInProgress: string;
  readonly correctionPlanned: string;
  /** La thématique d'une ligne qui n'en a pas une seule — l'audit lui-même. */
  readonly wholeSite: string;
  /** La date d'une ligne qui n'en a pas encore. */
  readonly dateToCome: string;
  /** `{month}` reçoit le mois prévu, mis en forme. */
  readonly auditPlanned: string;
  readonly auditNotPlanned: string;
  /** `{date}` reçoit le jour de fin, mis en forme. */
  readonly auditDone: string;
  readonly loadFailed: string;
  /** Les 13 thématiques RGAA, dans l'ordre de leur numéro. */
  readonly rgaaThemes: readonly string[];
}

export const ACCESSIBILITY_FOLLOW_UP_FR: AccessibilityFollowUpCopy = {
  title: 'Suivi des corrections',
  caption: 'Corrections d’accessibilité, par thématique du RGAA',
  columnTheme: 'Thématique',
  columnCorrection: 'Correction',
  columnDate: 'Date',
  columnStatus: 'Statut',
  correctionDone: 'Fait',
  correctionInProgress: 'En cours',
  correctionPlanned: 'Prévu',
  wholeSite: 'Ensemble du site',
  dateToCome: 'À dater',
  auditPlanned: 'Audit complet prévu en {month}.',
  auditNotPlanned: 'Audit complet : non encore planifié.',
  auditDone: 'Audit complet réalisé le {date}.',
  loadFailed: 'Le suivi des corrections n’a pas pu être chargé.',
  rgaaThemes: [
    'Images',
    'Cadres',
    'Couleurs',
    'Multimédia',
    'Tableaux',
    'Liens',
    'Scripts',
    'Éléments obligatoires',
    'Structuration de l’information',
    'Présentation de l’information',
    'Formulaires',
    'Navigation',
    'Consultation',
  ],
};

export const ACCESSIBILITY_FOLLOW_UP_EN: AccessibilityFollowUpCopy = {
  title: 'Corrections log',
  caption: 'Accessibility corrections, by RGAA topic',
  columnTheme: 'Topic',
  columnCorrection: 'Correction',
  columnDate: 'Date',
  columnStatus: 'Status',
  correctionDone: 'Done',
  correctionInProgress: 'In progress',
  correctionPlanned: 'Planned',
  wholeSite: 'Whole site',
  dateToCome: 'To be dated',
  auditPlanned: 'Full audit planned for {month}.',
  auditNotPlanned: 'Full audit: not yet scheduled.',
  auditDone: 'Full audit completed on {date}.',
  loadFailed: 'The corrections log could not be loaded.',
  rgaaThemes: [
    'Images',
    'Frames',
    'Colours',
    'Multimedia',
    'Tables',
    'Links',
    'Scripts',
    'Mandatory elements',
    'Information structure',
    'Presentation of information',
    'Forms',
    'Navigation',
    'Consultation',
  ],
};

export const ACCESSIBILITY_FOLLOW_UP_IT: AccessibilityFollowUpCopy = {
  title: 'Registro delle correzioni',
  caption: 'Correzioni di accessibilità, per tematica RGAA',
  columnTheme: 'Tematica',
  columnCorrection: 'Correzione',
  columnDate: 'Data',
  columnStatus: 'Stato',
  correctionDone: 'Fatto',
  correctionInProgress: 'In corso',
  correctionPlanned: 'Previsto',
  wholeSite: 'Intero sito',
  dateToCome: 'Da datare',
  auditPlanned: 'Audit completo previsto per {month}.',
  auditNotPlanned: 'Audit completo: non ancora pianificato.',
  auditDone: 'Audit completo svolto il {date}.',
  loadFailed: 'Non è stato possibile caricare il registro delle correzioni.',
  rgaaThemes: [
    'Immagini',
    'Frame',
    'Colori',
    'Multimedia',
    'Tabelle',
    'Link',
    'Script',
    'Elementi obbligatori',
    'Strutturazione dell’informazione',
    'Presentazione dell’informazione',
    'Moduli',
    'Navigazione',
    'Consultazione',
  ],
};

const DICTIONARIES: Readonly<Record<LocaleCode, AccessibilityFollowUpCopy>> = {
  fr: ACCESSIBILITY_FOLLOW_UP_FR,
  en: ACCESSIBILITY_FOLLOW_UP_EN,
  it: ACCESSIBILITY_FOLLOW_UP_IT,
};

/** Le dictionnaire de la langue choisie. */
export function accessibilityFollowUpCopy(locale: LocaleCode): AccessibilityFollowUpCopy {
  return DICTIONARIES[locale];
}
