import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import type { Variant } from '../../data/models';

/**
 * **Comment un onglet de la barre nomme une déclinaison.**
 *
 * 🔴 Le nom saisi d'abord. L'onglet affichait « Déclinaison 2 » — le rang, et
 * rien d'autre — alors que la création DEMANDE un nom (« Boîte de 220 g »). On
 * le saisissait, la base le gardait, il partait même aux canaux
 * (`projection.ts` pousse `variant.name`), et aucun écran ne le rendait : un
 * champ obligatoire qui n'apparaît nulle part ensuite se lit comme une saisie
 * perdue, et personne ne pouvait corriger une faute de frappe.
 *
 * **« Défaut » a cessé d'être le libellé du premier onglet**, et c'est un
 * choix. Son nom à elle voyage vers les canaux comme celui des autres : garder
 * le rôle en guise de nom rendait invisible la seule déclinaison qu'on ne
 * pouvait déjà pas corriger. Le rôle n'est pas perdu pour autant — il devient
 * une pastille à côté du nom, ce qu'il a toujours été : une propriété de
 * l'article, pas son identité.
 *
 * Le rang ne subsiste qu'en DERNIER recours : une fiche semée ou importée peut
 * porter un nom vide, et un onglet muet serait pire qu'un libellé générique.
 *
 * La langue est celle de la SOURCE : la barre est un repère de navigation, pas
 * un écran de traduction — celui-ci vit dans la section Identité, avec son
 * sélecteur de langue.
 */
export function variantTabLabel(variant: Variant): string {
  const name = (variant.name[SOURCE_LOCALE] ?? '').trim();
  if (name !== '') {
    return name;
  }
  return variant.isDefault ? 'Défaut' : `Déclinaison ${String(variant.position + 1)}`;
}
