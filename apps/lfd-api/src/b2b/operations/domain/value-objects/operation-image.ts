import {
  InvalidOperationFocalError,
  InvalidOperationImageError,
} from "../errors/operation-errors.js";

/** Un point focal : deux fractions de 0 à 1, à partir du coin haut gauche. */
export interface OperationFocal {
  readonly x: number;
  readonly y: number;
}

/** L'image telle qu'on la donne : le point focal est facultatif — absent, on recadre au centre. */
export interface OperationImageInput {
  readonly url: string;
  readonly alt: string;
  readonly focal?: OperationFocal | null | undefined;
}

/** L'image d'une opération, jugée : son adresse, son texte alternatif, son point focal. */
export interface OperationImage {
  readonly url: string;
  readonly alt: string;
  /** `null` : personne ne s'est prononcé à la médiathèque — la boutique recadre au centre. */
  readonly focal: OperationFocal | null;
}

/**
 * **L'image d'une opération**, ou rien.
 *
 * Le texte alternatif peut être vide — une image décorative n'a rien à dire à
 * un lecteur d'écran —, l'adresse jamais : une image sans adresse n'affiche
 * rien, et compterait pourtant comme « une image » à l'écran.
 *
 * Le point focal est celui de la MÉDIATHÈQUE (lot 2 du plan, O3) : le cas
 * d'usage le lit au choix de l'image, et le suit quand la médiathèque le
 * redécrit. Il est rangé ici pour que la boutique le serve sans relire le
 * fonds. Que l'adresse soit bien une image de la médiathèque, c'est le cas
 * d'usage qui le demande au port (`OperationImageLibrary`) : le domaine ne
 * lit pas le fonds.
 *
 * @throws {InvalidOperationImageError} l'adresse est vide.
 * @throws {InvalidOperationFocalError} le point focal sort de l'image.
 */
export function operationImage(raw: OperationImageInput | null): OperationImage | null {
  if (raw === null) {
    return null;
  }
  const url = raw.url.trim();
  if (url === "") {
    throw new InvalidOperationImageError();
  }
  return { url, alt: raw.alt.trim(), focal: operationFocal(raw.focal ?? null) };
}

/** @throws {InvalidOperationFocalError} une coordonnée hors de [0, 1], ou qui n'est pas un nombre. */
export function operationFocal(raw: OperationFocal | null): OperationFocal | null {
  if (raw === null) {
    return null;
  }
  if (!isFraction(raw.x) || !isFraction(raw.y)) {
    throw new InvalidOperationFocalError(raw.x, raw.y);
  }
  return { x: raw.x, y: raw.y };
}

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
