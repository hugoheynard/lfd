/**
 * La révision portée par la clé d'une photo de carte : ce qui suit le DERNIER
 * `-`.
 *
 * Commune aux étapes de livraison et aux notes du commercial : chaque usage
 * compose sa clé en `…/{cardId}-{revision}`, avec des ULID qui n'ont pas de
 * tiret. Le dernier tiret est donc celui que l'usage a posé, et c'est pour ça
 * qu'aucun suffixe ne se colle après la révision (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D7) : la vignette
 * d'une note se range sous un dossier `thumbs/`, pas sous un `-thumb`.
 *
 * L'écran invalide son image sur ce seul suffixe.
 */
export function photoCardRevision(photoKey: string): string {
  return photoKey.slice(photoKey.lastIndexOf("-") + 1);
}
