import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

import {
  LEGAL_ENTITY_LOGO_ACCEPTED_TYPES,
  LEGAL_ENTITY_LOGO_MAX_BYTES,
  LEGAL_ENTITY_LOGO_MIN_SIDE,
} from "@lfd/contracts";

import { InvalidEntityLogoError } from "../../errors/accounting-errors.js";
import {
  EntityLogo,
  entityLogoContentType,
  LOGO_ACCEPTED_TYPES,
  LOGO_MAX_BYTES,
  LOGO_MIN_SIDE,
} from "../entity-logo.js";

/**
 * Un PNG **réel** aux dimensions demandées — en-tête complet, IHDR, et un IDAT
 * qui contient vraiment les pixels.
 *
 * Fabriqué plutôt que chargé d'un fichier : les octets sont le SUJET de ces
 * tests, et un fichier d'appoint dans le dépôt rendrait chaque cas illisible
 * (« pourquoi celui-là est-il refusé ? il faut ouvrir l'image »). Ici, la
 * dimension est écrite dans l'appel.
 */
function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits, niveaux de gris, sans entrelacement — le plus court qui soit valide.
  header[8] = 8;
  const raw = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Un morceau PNG : longueur, type, données, CRC — dans cet ordre. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * Un JPEG **réel** aux dimensions demandées : `SOI`, un `SOF0` qui les porte,
 * puis `EOI`. `imageDimensions` remonte la chaîne de segments — c'est elle
 * qu'on éprouve, pas une constante.
 */
function jpeg(width: number, height: number): Buffer {
  const frame = Buffer.alloc(11);
  // Longueur du segment (11), précision (8), hauteur, largeur, 1 composante.
  frame.writeUInt16BE(11, 0);
  frame[2] = 8;
  frame.writeUInt16BE(height, 3);
  frame.writeUInt16BE(width, 5);
  frame[7] = 1;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc0]),
    frame,
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe("EntityLogo — ce qu'il accepte", () => {
  it("accepte un PNG carré au côté minimum, et déduit son type des OCTETS", () => {
    const logo = EntityLogo.create("logo.png", png(LOGO_MIN_SIDE, LOGO_MIN_SIDE));

    expect(logo.contentType).toBe("image/png");
    expect(logo.width).toBe(LOGO_MIN_SIDE);
    expect(logo.height).toBe(LOGO_MIN_SIDE);
    expect(logo.fileName).toBe("logo.png");
    expect(logo.size).toBeGreaterThan(0);
  });

  it("accepte un JPEG, et ne croit pas l'extension : le type vient des octets", () => {
    // Extension mensongère, contenu honnête : c'est le contenu qui décide, et
    // c'est ce qui protège du cas inverse (un PDF nommé `.png`).
    const logo = EntityLogo.create("logo.png", jpeg(300, 300));
    expect(logo.contentType).toBe("image/jpeg");
  });

  it("tolère 10 % d'écart entre largeur et hauteur — un export porte souvent une ligne de plus", () => {
    expect(() => EntityLogo.create("logo.png", png(300, 280))).not.toThrow();
  });
});

describe("EntityLogo — chaque refus nomme le cas et le geste", () => {
  it("refuse un nom vide", () => {
    expect(() => EntityLogo.create("   ", png(300, 300))).toThrow(InvalidEntityLogoError);
  });

  it("refuse un fichier vide", () => {
    expect(() => EntityLogo.create("logo.png", Buffer.alloc(0))).toThrow(/vide/u);
  });

  it("refuse au-delà de 2 Mo, en disant le poids reçu ET la limite", () => {
    // Un PNG valide, gonflé d'octets au-delà du plafond : le test doit tomber
    // sur la TAILLE, pas sur le format — d'où l'en-tête intact.
    const heavy = Buffer.concat([png(300, 300), Buffer.alloc(LOGO_MAX_BYTES)]);

    expect(() => EntityLogo.create("logo.png", heavy)).toThrow(/2\.0 Mo/u);
  });

  it("refuse un PDF déguisé en .png — le mandat ne saurait pas le dessiner", () => {
    const pdf = Buffer.from("%PDF-1.4\nrien d'une image", "latin1");

    expect(() => EntityLogo.create("logo.png", pdf)).toThrow(/PNG ou un JPEG/u);
  });

  it("refuse un HEIC, qui est bien une image mais que pdfkit ne dessine pas", () => {
    const heic = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from("ftypheic", "latin1"),
      Buffer.alloc(16),
    ]);

    expect(() => EntityLogo.create("logo.heic", heic)).toThrow(InvalidEntityLogoError);
  });

  it("refuse une image tronquée, dont les dimensions ne se lisent pas", () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    expect(() => EntityLogo.create("logo.png", truncated)).toThrow(/tronqu/u);
  });

  it("refuse en dessous de 256 px de côté, en nommant les dimensions reçues", () => {
    expect(() => EntityLogo.create("logo.png", png(220, 220))).toThrow(/220 × 220/u);
  });

  /**
   * Le cas qui motive la règle : le mandat réserve une cellule CARRÉE et y pose
   * l'image aux dimensions qu'il choisit. Une bannière y serait écrasée, pas
   * recadrée — et un logo étiré sur un mandat est un document qu'on n'ose pas
   * envoyer.
   */
  it("refuse une bannière 4000 × 100, en nommant les dimensions reçues", () => {
    expect(() => EntityLogo.create("logo.jpg", jpeg(4000, 100))).toThrow(/4000 × 100/u);
  });

  it("refuse un écart de plus de 10 % même quand les deux côtés sont grands", () => {
    expect(() => EntityLogo.create("logo.png", png(1000, 800))).toThrow(/carr/u);
  });
});

describe("entityLogoContentType — relire le type d'un logo déjà rangé", () => {
  it("reconnaît PNG et JPEG", () => {
    expect(entityLogoContentType(png(300, 300))).toBe("image/png");
    expect(entityLogoContentType(jpeg(300, 300))).toBe("image/jpeg");
  });

  it("rend null sur ce qui n'est ni l'un ni l'autre — une incohérence, pas une donnée", () => {
    expect(entityLogoContentType(Buffer.from("%PDF-1.4", "latin1"))).toBeNull();
  });
});

/**
 * 🔴 Les trois bornes existent EN DOUBLE — ici dans le domaine, qui refuse, et
 * dans `@lfd/contracts`, que l'écran lit pour les énoncer.
 *
 * La copie n'est pas un oubli : le domaine ne doit dépendre de rien, et
 * `@lfd/contracts` tire Zod (§3 du CLAUDE.md racine). Aucun des deux ne peut
 * donc importer l'autre.
 *
 * Ce qui manquait, c'est ce qui les tient ensemble. Sans ces assertions, changer
 * une borne d'un côté laisse l'autre dériver **en silence** — et celle qui
 * dérive est celle que l'utilisateur LIT, pendant que celle qui refuse dit
 * autre chose. L'écran annoncerait 512 pendant que le serveur refuse à 256, et
 * personne ne saurait lequel croire.
 *
 * Ce test est le seul endroit du dépôt qui peut voir les deux à la fois.
 */
describe("les bornes du domaine et celles du contrat", () => {
  it("ne peuvent pas diverger sans que ce test tombe", () => {
    expect(LOGO_MAX_BYTES).toBe(LEGAL_ENTITY_LOGO_MAX_BYTES);
    expect(LOGO_MIN_SIDE).toBe(LEGAL_ENTITY_LOGO_MIN_SIDE);
    // Comparés par leur JOINTURE plutôt que par un spread : la règle
    // type-aware d'ESLint refuse d'étaler un tuple `readonly` importé d'un
    // paquet du dépôt, et une liste ordonnée se compare aussi bien ainsi.
    expect(LOGO_ACCEPTED_TYPES.join(",")).toBe(LEGAL_ENTITY_LOGO_ACCEPTED_TYPES.join(","));
  });
});
