import { imageDimensions } from "@lfd/storage";

import type { AppError } from "../../../../../platform/shared/errors/app-error.js";

/** Les deux types qu'une carte accepte. */
export type CardPhotoContentType = "image/jpeg" | "image/png";

/** Les refus de la photo, dans les mots de l'usage (« Photo de l'étape : … »). */
export interface CardPhotoRefusals {
  readonly empty: () => AppError;
  readonly tooHeavy: (size: number, max: number) => AppError;
  readonly unsupportedFormat: () => AppError;
  readonly truncated: () => AppError;
}

/** Le poids maximal de l'usage, et ses mots. */
export interface CardPhotoRules {
  readonly maxBytes: number;
  readonly refusals: CardPhotoRefusals;
}

/**
 * Un format accepté, reconnu à ses octets de tête — le `mimetype` annoncé par
 * le client se falsifie d'un champ de formulaire, les octets non.
 */
interface AcceptedFormat {
  readonly contentType: CardPhotoContentType;
  readonly matches: (bytes: Buffer) => boolean;
}

const ACCEPTED_FORMATS: readonly AcceptedFormat[] = [
  {
    contentType: "image/jpeg",
    matches: (bytes) => startsWith(bytes, Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    contentType: "image/png",
    matches: (bytes) =>
      startsWith(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * **La photo d'une carte**, validée.
 *
 * Plus large qu'un logo sur ce qui ne compte pas ici : ni taille minimale, ni
 * ratio — une photo de téléphone est rarement carrée, et une photo floue reste
 * plus utile que pas de photo. Ce qui reste refusé est ce qui coûterait au
 * lecteur (le poids) ou ne s'afficherait pas (un format que l'écran ne dessine
 * pas, une image tronquée).
 *
 * `create()` est le seul constructeur : une photo non conforme n'existe pas en
 * mémoire, donc ne part jamais au stockage.
 */
export class CardPhoto {
  private constructor(
    readonly bytes: Buffer,
    readonly contentType: CardPhotoContentType,
  ) {}

  /**
   * Vide puis poids d'abord — avant de faire travailler quoi que ce soit
   * dessus —, format ensuite, dimensions enfin. Cet ordre choisit LE message
   * qu'on lit quand plusieurs refus s'appliquent.
   *
   * @throws une des fabriques de `rules.refusals`.
   */
  static create(bytes: Buffer, rules: CardPhotoRules): CardPhoto {
    if (bytes.length === 0) {
      throw rules.refusals.empty();
    }
    if (bytes.length > rules.maxBytes) {
      throw rules.refusals.tooHeavy(bytes.length, rules.maxBytes);
    }
    const contentType = cardPhotoContentType(bytes);
    if (contentType === null) {
      throw rules.refusals.unsupportedFormat();
    }
    if (imageDimensions(bytes) === null) {
      throw rules.refusals.truncated();
    }
    return new CardPhoto(bytes, contentType);
  }
}

/**
 * Le type d'une photo, relu dans ses octets — aucune colonne ne le porte, et
 * une colonne pourrait mentir là où huit octets ne le peuvent pas. `null` quand
 * ce n'est ni un JPEG ni un PNG.
 */
export function cardPhotoContentType(bytes: Buffer): CardPhotoContentType | null {
  return ACCEPTED_FORMATS.find((candidate) => candidate.matches(bytes))?.contentType ?? null;
}

/** Une taille en Mo, à une décimale — la forme sous laquelle les refus l'énoncent. */
export function megabytes(bytes: number): string {
  return (bytes / BYTES_PER_MEGABYTE).toFixed(1);
}

function startsWith(bytes: Buffer, magic: Buffer): boolean {
  return bytes.subarray(0, magic.length).equals(magic);
}
