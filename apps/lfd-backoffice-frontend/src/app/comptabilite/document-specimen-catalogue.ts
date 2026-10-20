import type { FoldChoiceOption } from 'fold-ng';

/** Les exemplaires que le serveur sait rendre — le nom de la route, sans `.pdf`. */
export type SpecimenKey =
  'order-sheet-pro' | 'order-sheet-public' | 'atelier-sheet' | 'round-paper' | 'invoice';

/** Le nom de chaque exemplaire. Un `Record` : une clé ajoutée sans nom ne compile pas. */
export const SPECIMEN_LABELS: Readonly<Record<SpecimenKey, string>> = {
  'order-sheet-pro': 'Bon de commande — pro',
  'order-sheet-public': 'Bon de commande — public',
  'atelier-sheet': "Fiche d'atelier",
  'round-paper': 'Feuille de tournée (livreur)',
  invoice: 'Facture Factur-X',
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
 * jamais un montant), et la facture. Il n'y a pas de bon « bureau » : le bon
 * que le staff ouvre est celui du client.
 */
export const SPECIMEN_GROUPS: readonly SpecimenGroup[] = [
  group('Bons chiffrés', ['order-sheet-pro', 'order-sheet-public']),
  group('Bons non chiffrés', ['atelier-sheet', 'round-paper']),
  group('Factures', ['invoice']),
];

/** Une clé reçue de `fold-choice-row` (une `string`) est-elle un exemplaire ? */
export function isSpecimenKey(key: string): key is SpecimenKey {
  return Object.hasOwn(SPECIMEN_LABELS, key);
}
