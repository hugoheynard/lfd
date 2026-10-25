import type { FoldChoiceOption } from 'fold-ng';

/** Les exemplaires que le serveur sait rendre — le nom de la route, sans `.pdf`. */
export type SpecimenKey =
  | 'order-sheet-pro'
  | 'order-sheet-public'
  | 'atelier-sheet'
  | 'round-paper'
  | 'invoice'
  | 'sepa-mandate-b2b'
  | 'sepa-mandate-core'
  | 'order-summary'
  | 'allergen-matrix'
  | 'production-count'
  | 'day-dossier'
  | 'delivery-note-carrier'
  | 'delivery-note-client-pro'
  | 'bag-label'
  | 'bin-label';

/** Le nom de chaque exemplaire. Un `Record` : une clé ajoutée sans nom ne compile pas. */
export const SPECIMEN_LABELS: Readonly<Record<SpecimenKey, string>> = {
  'order-sheet-pro': 'Confirmation de commande — pro',
  'order-sheet-public': 'Confirmation de commande — public',
  'atelier-sheet': "Fiche d'atelier",
  'round-paper': 'Feuille de tournée (livreur)',
  invoice: 'Facture Factur-X',
  'sepa-mandate-b2b': 'Mandat SEPA interentreprises (B2B)',
  'sepa-mandate-core': 'Mandat SEPA CORE',
  'order-summary': 'Récapitulatif de commandes',
  'allergen-matrix': 'Matrice des allergènes',
  'production-count': 'Compte à produire',
  'day-dossier': 'Dossier du jour',
  'delivery-note-carrier': 'Bon de livraison — transport',
  'delivery-note-client-pro': 'Bon de livraison — client pro',
  'bag-label': 'Étiquette de sac',
  'bin-label': 'Étiquette de bac',
};

/** Un groupe de la planche : ce qu'un document dit de l'argent. */
export interface SpecimenGroup {
  readonly title: string;
  readonly options: readonly FoldChoiceOption[];
}

function group(title: string, keys: readonly SpecimenKey[]): SpecimenGroup {
  return { title, options: keys.map((key) => ({ key, label: SPECIMEN_LABELS[key] })) };
}

/**
 * **La planche, rangée par ce que le papier montre** : les bons qui portent
 * des prix, ceux qui n'en portent aucun (le fournil et le livreur ne lisent
 * jamais un montant — le bon de livraison de transport non plus, il voyage
 * avec la marchandise), les papiers du fournil pour la journée (compte à
 * produire, dossier du jour), la facture, les deux mandats SEPA, le récapitulatif de
 * commandes d'une société, la matrice des allergènes du catalogue, et les
 * étiquettes A6 du colisage — sac et bac (2026-10-25). Il n'y
 * a pas de bon « bureau » : le bon que le staff ouvre est celui du client.
 */
export const SPECIMEN_GROUPS: readonly SpecimenGroup[] = [
  group('Bons chiffrés', ['order-sheet-pro', 'order-sheet-public', 'delivery-note-client-pro']),
  group('Bons non chiffrés', ['atelier-sheet', 'round-paper', 'delivery-note-carrier']),
  group('Fournil', ['production-count', 'day-dossier']),
  group('Factures', ['invoice']),
  group('Mandats', ['sepa-mandate-b2b', 'sepa-mandate-core']),
  group('Récapitulatifs', ['order-summary']),
  group('Catalogue', ['allergen-matrix']),
  group('Étiquettes', ['bag-label', 'bin-label']),
];

/** Une clé reçue de `fold-choice-row` (une `string`) est-elle un exemplaire ? */
export function isSpecimenKey(key: string): key is SpecimenKey {
  return Object.hasOwn(SPECIMEN_LABELS, key);
}
