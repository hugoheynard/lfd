import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le nom d'un objet du bucket adressé par son contenu : `{sha256}.{ext}`.
 *
 * Soixante-quatre chiffres hexadécimaux en minuscules, un point, une extension
 * — c'est ce que `contentAddressedKey` de `@lfd/storage` fabrique, et rien
 * d'autre ne l'est.
 */
const CONTENT_ADDRESS = /^[0-9a-f]{64}\.[a-z0-9]+$/;

/**
 * Une clé de stockage qui n'est pas adressée par son contenu.
 *
 * Seul le magasin d'octets fabrique les clés d'un dépôt : arriver ici est un
 * désaccord entre lui et le domaine, pas une erreur de l'utilisateur (→ 500).
 */
export class NotContentAddressedError extends TechnicalError {
  constructor(readonly storageKey: string) {
    super(
      "media.not_content_addressed",
      `La clé de stockage « ${storageKey} » n'est pas de la forme {empreinte}.{extension} : ` +
        "le magasin d'images et la médiathèque ont divergé, le dépôt ne peut pas savoir si " +
        "l'image est déjà au fonds. Signalez-le à l'équipe technique.",
    );
  }
}

/**
 * Ce qui fait l'identité d'une image déposée : l'empreinte de ses octets et son
 * extension, **sans le préfixe** de la clé (2026-10-13, lot D0 du plan du
 * préfixe universel de la médiathèque).
 *
 * 🔴 Le dépôt retrouvait une image déjà au fonds par son URL. L'URL porte le
 * préfixe : le jour où il change, les mêmes octets donnent une autre URL, et
 * le fonds se serait mis à porter deux lignes pour une image. Le préfixe dit où
 * l'objet est rangé ; le contenu dit ce qu'il est.
 *
 * @throws {NotContentAddressedError} le dernier segment de la clé n'est pas
 *   `{sha256}.{ext}`.
 */
export function contentAddressOf(storageKey: string): string {
  const name = storageKey.split("/").at(-1) ?? "";
  if (!CONTENT_ADDRESS.test(name)) {
    throw new NotContentAddressedError(storageKey);
  }
  return name;
}
