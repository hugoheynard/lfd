/**
 * **La latitude d'une ligne AVANT qu'on ait décidé quoi que ce soit.**
 *
 * `mercurialeRow` rend `null` sur une ligne sans prix saisi, et c'est juste pour
 * tout ce qui décrit une **décision** : un prix final, un écart au catalogue, un
 * relèvement. Une ligne qui ne porte aucune décision n'en a aucun.
 *
 * La marge de négoce n'est pas de cette famille. Elle ne décrit pas ce qu'on a
 * accordé mais **ce qu'on peut encore accorder**, et c'est précisément le
 * chiffre qu'on cherche en ouvrant la fiche d'un client qu'on n'a pas encore
 * tarifé : « jusqu'où puis-je descendre sur cet article ? ». Un tiret n'y
 * répondait pas — il fallait soustraire de tête la limite du tarif, ligne par
 * ligne.
 *
 * ⚠️ Les deux chiffres portent **le même nom dans la même colonne** et ne
 * disent pas la même chose : l'un part du prix accordé, l'autre du tarif
 * catalogue. L'écran les distingue par la note en dessous — « jusqu'à 1,20 € »
 * contre « depuis le catalogue ». Sans elle, la colonne bougerait au moment où
 * l'on tape un prix sans qu'on sache pourquoi.
 *
 * Bornée à zéro : un tarif catalogue déjà sous sa propre limite donnerait une
 * marge négative, c'est-à-dire une hausse déguisée en remise dans la colonne où
 * on lit les remises.
 */
export function openRoomMillicents(
  catalogMillicents: number,
  floorMillicents: number | null,
): number | null {
  // Sans limite posée, il n'y a pas de latitude DÉFINIE : rendre un nombre
  // annoncerait qu'on peut descendre jusqu'à zéro, ce que personne n'a décidé.
  if (floorMillicents === null) {
    return null;
  }
  return Math.max(0, catalogMillicents - floorMillicents);
}
