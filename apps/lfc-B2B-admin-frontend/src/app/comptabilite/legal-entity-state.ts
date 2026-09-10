import type { LegalEntityView } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * L'état d'une entité juridique, **dit une seule fois** pour toute la
 * comptabilité : la colonne « État » de la liste et le badge de l'en-tête de la
 * fiche lisent d'ici.
 *
 * Deux définitions de « peut encaisser » finiraient par diverger, et c'est
 * celle que l'utilisateur lit qui dériverait — la liste dirait « Incomplète »
 * là où la fiche dirait « Peut encaisser ». Ce qui MANQUE reste rédigé par le
 * serveur (`missingToCollect`) : rien ici ne le recalcule.
 *
 * L'archivage passe avant tout le reste : une entité archivée n'émet plus, que
 * son bloc créancier soit complet ou non.
 */
export function legalEntityStateLabel(entity: LegalEntityView): string {
  if (entity.archivedAt !== null) {
    return 'Archivée';
  }
  return entity.canCollect ? 'Peut encaisser' : 'Incomplète';
}

/** La couleur du même état — voir {@link legalEntityStateLabel}. */
export function legalEntityStateVariant(entity: LegalEntityView): FoldBadgeVariant {
  if (entity.archivedAt !== null) {
    return 'neutral';
  }
  return entity.canCollect ? 'success' : 'warning';
}
