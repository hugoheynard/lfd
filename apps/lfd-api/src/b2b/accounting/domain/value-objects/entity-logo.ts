import { imageDimensions } from "@lfd/storage";

import { InvalidEntityLogoError } from "../errors/accounting-errors.js";

/**
 * **2 Mo.** Un logo n'est pas un scan : au-delà, ce qui monte est une photo ou
 * un export non aplati, et ces octets-là voyageront dans chaque mandat rendu.
 *
 * ⚠️ `@lfd/contracts` en garde une copie sous le même nom, pour que l'écran
 * énonce la borne sans la réinventer. Le domaine reste l'autorité : c'est ici
 * qu'on refuse, et c'est ici que le test l'éprouve.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * **256 px de côté au minimum.** En dessous, le logo est flou à l'impression du
 * mandat — et c'est à l'impression qu'on s'en aperçoit, c'est-à-dire sur un
 * document déjà parti chez un client.
 */
export const LOGO_MIN_SIDE = 256;

/**
 * Les types acceptés — liste d'**acceptation** : ce qui n'y est pas est refusé.
 *
 * Ni PDF (ce n'est pas une image), ni HEIC : `pdfkit` ne sait pas les dessiner,
 * et les accepter produirait un mandat sans logo sans que rien ne le dise.
 */
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg"] as const;

/**
 * Un **format accepté**, reconnu à ses octets de tête.
 *
 * Le `mimetype` annoncé par le client ne décide de rien : il se falsifie d'un
 * champ de formulaire, et un PDF renommé `.png` partirait alors au stockage pour
 * revenir se faire dessiner par `pdfkit`, qui n'en ferait rien.
 */
interface AcceptedFormat {
  readonly contentType: (typeof LOGO_ACCEPTED_TYPES)[number];
  readonly matches: (bytes: Buffer) => boolean;
}

const ACCEPTED_FORMATS: readonly AcceptedFormat[] = [
  {
    contentType: "image/png",
    matches: (bytes) =>
      startsWith(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    contentType: "image/jpeg",
    matches: (bytes) => startsWith(bytes, Buffer.from([0xff, 0xd8, 0xff])),
  },
];

/**
 * L'écart toléré entre largeur et hauteur — **10 %**.
 *
 * Le logo occupe une cellule CARRÉE du formulaire de mandat, et `pdfkit` y pose
 * l'image aux dimensions qu'on lui donne : une image de 4000 × 100 y serait
 * écrasée en carré, pas recadrée. Un logo étiré sur un mandat est un document
 * qu'on n'ose pas envoyer, et on ne s'en aperçoit qu'une fois imprimé.
 *
 * 10 % plutôt que 0 % : un export porte souvent une ligne de pixels
 * transparents de plus, et refuser 256 × 255 ferait refaire un fichier
 * parfaitement bon.
 */
const SQUARENESS_TOLERANCE = 0.1;

/**
 * **Le logo d'une entité émettrice** — celui qui s'imprime dans la cellule du
 * mandat SEPA.
 *
 * Bâti sur le modèle de `ScannedDocument`, mais **plus étroit sur les trois
 * points qui comptent ici** : ce n'est pas une pièce qu'un humain nous remet
 * pour qu'on la relise, c'est une image que nous allons DESSINER sur un document
 * opposable. Ce qui passe ici ressort imprimé chez un client.
 *
 * D'où PNG ou JPEG uniquement (ce que `pdfkit` sait dessiner), 2 Mo (un logo
 * n'est pas un scan), un côté minimum, et la quasi-quadrature.
 *
 * `create()` est le seul constructeur : un logo non conforme n'existe pas en
 * mémoire, et aucun appelant n'a de branche à écrire — ni à oublier.
 */
export class EntityLogo {
  private constructor(
    readonly fileName: string,
    readonly bytes: Buffer,
    readonly contentType: string,
    readonly width: number,
    readonly height: number,
  ) {}

  /**
   * Valide des octets déposés, et rend ce qu'on en a constaté.
   *
   * L'ordre des contrôles est délibéré : on refuse ce qui est vide, puis ce qui
   * est trop gros — avant de faire travailler quoi que ce soit dessus —, puis ce
   * dont le type n'est pas accepté, et seulement ensuite on mesure.
   *
   * @throws {InvalidEntityLogoError} nom vide, fichier vide, trop gros, format
   *   refusé, dimensions illisibles, trop petit ou trop étiré.
   */
  static create(fileName: string, bytes: Buffer): EntityLogo {
    const name = fileName.trim();
    if (name === "") {
      throw new InvalidEntityLogoError("le fichier n'a pas de nom. Renommez-le puis redéposez-le.");
    }
    if (bytes.length === 0) {
      throw new InvalidEntityLogoError("le fichier est vide. Vérifiez-le puis redéposez-le.");
    }
    if (bytes.length > LOGO_MAX_BYTES) {
      throw new InvalidEntityLogoError(
        `le fichier pèse ${megabytes(bytes.length)} Mo, la limite est de ` +
          `${megabytes(LOGO_MAX_BYTES)} Mo. Exportez le logo en plus léger — ` +
          `un logo n'est pas un scan.`,
      );
    }

    const format = ACCEPTED_FORMATS.find((candidate) => candidate.matches(bytes));
    if (format === undefined) {
      throw new InvalidEntityLogoError(
        "un PNG ou un JPEG est attendu (ni PDF, ni HEIC). Le mandat dessine ce logo, " +
          "et ces deux formats sont les seuls qu'il sait dessiner.",
      );
    }

    const measured = imageDimensions(bytes);
    if (measured === null) {
      throw new InvalidEntityLogoError(
        "l'image est tronquée : ses dimensions ne se lisent pas. Réexportez-la puis redéposez-la.",
      );
    }
    const { width, height } = measured;

    const smallestSide = Math.min(width, height);
    if (smallestSide < LOGO_MIN_SIDE) {
      throw new InvalidEntityLogoError(
        `l'image fait ${width} × ${height} px ; il en faut au moins ` +
          `${LOGO_MIN_SIDE} de côté. En dessous, le logo est flou à ` +
          `l'impression du mandat — et cela ne se voit qu'une fois imprimé.`,
      );
    }

    if (Math.abs(width - height) > Math.max(width, height) * SQUARENESS_TOLERANCE) {
      throw new InvalidEntityLogoError(
        `l'image fait ${width} × ${height} px, ce qui n'est pas carré. Le mandat lui ` +
          `réserve une cellule carrée et l'y écrase telle quelle : recadrez le logo au ` +
          `carré avant de le redéposer.`,
      );
    }

    return new EntityLogo(name, bytes, format.contentType, width, height);
  }

  get size(): number {
    return this.bytes.length;
  }
}

/**
 * Le type d'un logo **déjà rangé**, relu dans ses octets.
 *
 * Il existe parce qu'aucune colonne ne porte le type : le stockage rend des
 * octets, et servir un logo demande de dire ce que c'est. Le relire coûte huit
 * comparaisons et évite une colonne qui pourrait mentir.
 *
 * Rend `null` quand les octets ne sont ni un PNG ni un JPEG — ce qui, pour un
 * objet que seul {@link EntityLogo.create} a pu écrire, signale une incohérence
 * entre le bucket et la base, pas une donnée invalide.
 */
export function entityLogoContentType(bytes: Buffer): string | null {
  return ACCEPTED_FORMATS.find((candidate) => candidate.matches(bytes))?.contentType ?? null;
}

/** Ces octets commencent-ils par cette signature ? */
function startsWith(bytes: Buffer, magic: Buffer): boolean {
  return bytes.subarray(0, magic.length).equals(magic);
}

/** Une taille en Mo, à une décimale — c'est ainsi qu'on la lit dans un message. */
function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
