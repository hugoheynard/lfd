import type { MediaSlot } from './product-http-api';

/**
 * Le rôle d'une image rattachée à qui l'on a retiré tous ses usages.
 *
 * 🔴 Ce n'est PAS un usage, et il ne part jamais au serveur : la liste
 * enregistrée est filtrée par {@link persistedMedia}. Il n'existe que pour
 * qu'une image décochée de partout reste À L'ÉCRAN, où l'on dit qu'elle ne
 * s'enregistrera pas, au lieu de disparaître de la galerie sans un mot.
 */
export const NO_MEDIA_ROLE = '';

/**
 * Les usages qui n'admettent qu'une image par fiche — même liste que
 * `SINGLE_ROLES` du domaine (`media.ts`), dont le serveur refuse le second.
 */
export const SINGLE_MEDIA_ROLES: readonly string[] = ['hero', 'thumbnail'];

/**
 * Une image de la fiche, UNE fois, avec tous ses usages.
 *
 * Depuis le 2026-10-18 (décision de Hugo), une même image peut porter
 * plusieurs usages : la base l'accepte (clé `productId, url, role`), et 150
 * fiches portaient déjà ouverture et vignette sur la même URL. Le serveur
 * parle toujours en liste PLATE — une entrée par couple image × usage ; c'est
 * l'écran qui regroupe.
 */
export interface MediaImage extends Omit<MediaSlot, 'role'> {
  /** Ses usages, dans l'ordre où la liste plate les donne. Vide = aucun. */
  readonly roles: readonly string[];
}

/**
 * Regroupe la liste plate par URL, dans l'ordre de PREMIÈRE apparition.
 *
 * Les faits de l'image (nom, alternative, dimensions) sont ceux de sa première
 * entrée : ils décrivent l'image, pas l'usage, et sont identiques d'une entrée
 * à l'autre.
 */
export function groupMediaByImage(flat: readonly MediaSlot[]): MediaImage[] {
  const byUrl = new Map<string, { image: MediaSlot; roles: string[] }>();
  for (const slot of flat) {
    const known = byUrl.get(slot.url);
    const roles = known?.roles ?? [];
    if (slot.role !== NO_MEDIA_ROLE && !roles.includes(slot.role)) {
      roles.push(slot.role);
    }
    if (known === undefined) {
      byUrl.set(slot.url, { image: slot, roles });
    }
  }
  return [...byUrl.values()].map(({ image, roles }) => {
    const { role: _role, ...facts } = image;
    return { ...facts, roles };
  });
}

/**
 * Remet les images à plat — une entrée par usage, dans l'ordre de la galerie.
 *
 * Une image sans usage y garde une entrée {@link NO_MEDIA_ROLE}, pour rester à
 * l'écran ; {@link persistedMedia} l'écarte de ce qui s'enregistre.
 */
export function flattenMediaImages(images: readonly MediaImage[]): MediaSlot[] {
  return images.flatMap(({ roles, ...facts }) =>
    (roles.length === 0 ? [NO_MEDIA_ROLE] : roles).map((role) => ({ ...facts, role })),
  );
}

/** Ce qui part au serveur : la liste plate, sans les images sans usage. */
export function persistedMedia(flat: readonly MediaSlot[]): MediaSlot[] {
  return flat.filter((slot) => slot.role !== NO_MEDIA_ROLE);
}

/**
 * Donne à une image EXACTEMENT ces usages.
 *
 * 🔴 L'unicité appartient au verbe : cocher un usage unique (ouverture,
 * vignette) sur une image le retire de celle qui le portait, dans la même mise
 * à jour. Deux ouvertures sont inexprimables, pas refusées par le serveur.
 * L'image délogée garde ses autres usages ; si elle n'en a plus, elle reste
 * affichée sans usage, et l'écran le dit.
 */
export function withMediaRoles(
  images: readonly MediaImage[],
  url: string,
  roles: readonly string[],
): MediaImage[] {
  const taken = roles.filter((role) => SINGLE_MEDIA_ROLES.includes(role));
  return images.map((image) => {
    if (image.url === url) {
      return { ...image, roles: [...new Set(roles)] };
    }
    const kept = image.roles.filter((role) => !taken.includes(role));
    return kept.length === image.roles.length ? image : { ...image, roles: kept };
  });
}

/**
 * Qui porte déjà chaque usage UNIQUE, hors de l'image donnée — pour que le
 * panneau dise, au moment où l'on coche, de quelle image l'usage sera retiré.
 */
export function singleRoleHolders(
  images: readonly MediaImage[],
  url: string,
): Readonly<Record<string, string>> {
  const holders: Record<string, string> = {};
  for (const image of images) {
    if (image.url === url) {
      continue;
    }
    for (const role of image.roles) {
      if (SINGLE_MEDIA_ROLES.includes(role)) {
        holders[role] = image.name.trim() === '' ? 'une autre image' : `« ${image.name.trim()} »`;
      }
    }
  }
  return holders;
}
