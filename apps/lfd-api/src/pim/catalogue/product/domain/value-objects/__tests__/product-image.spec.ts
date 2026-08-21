import { productImage, UnsupportedImageError } from "../product-image.js";

/** Un PNG minimal : signature + IHDR. Seuls les 24 premiers octets sont lus. */
function png(width: number, height: number, padding = 0): Buffer {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(0x89504e47, 0);
  header.writeUInt32BE(0x0d0a1a0a, 4);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.alloc(padding)]);
}

describe("productImage", () => {
  it("accepte un PNG conforme et rend ce qu'il a CONSTATÉ", () => {
    const image = productImage(png(1200, 800));

    expect(image.contentType).toBe("image/png");
    expect(image.width).toBe(1200);
    expect(image.height).toBe(800);
    expect(image.byteLength).toBe(24);
  });

  it("refuse un format hors liste d'acceptation", () => {
    // Un PDF est reconnu par le renifleur — donc ce n'est pas « type inconnu »
    // qui le refuse, c'est bien la liste d'acceptation.
    expect(() => productImage(Buffer.from("%PDF-1.7\n" + "0".repeat(300)))).toThrow(
      UnsupportedImageError,
    );
  });

  it("refuse un fichier dont le TYPE ANNONCÉ mentirait", () => {
    // Le point de tout l'exercice : rien n'est cru sur parole. Ici les octets
    // sont du texte ; aucune extension ni aucun en-tête HTTP ne peut les sauver.
    const hostile = Buffer.from('<svg onload="alert(1)"></svg>'.padEnd(400, " "));
    expect(() => productImage(hostile)).toThrow(/format non accepté/);
  });

  it("refuse le vide et le trop gros", () => {
    expect(() => productImage(Buffer.alloc(0))).toThrow(/vide/);
    expect(() => productImage(png(1200, 800, 11 * 1024 * 1024))).toThrow(/dépassent la limite/);
  });

  it("refuse un PNG dont l'en-tête ne se lit pas", () => {
    // Type reconnu, dimensions illisibles : le fichier est tronqué. Le laisser
    // passer donnerait un visuel sans dimensions dont personne ne saurait dire,
    // plus tard, s'il est cassé ou simplement ancien.
    const truncated = png(1200, 800).subarray(0, 12);
    expect(() => productImage(truncated)).toThrow(/dimensions sont illisibles/);
  });

  it("refuse une image trop petite pour être un visuel de catalogue", () => {
    expect(() => productImage(png(64, 64))).toThrow(/trop petit/);
    expect(() => productImage(png(1200, 64))).toThrow(/trop petit/);
  });

  it("accepte exactement la limite basse, et refuse un pixel en dessous", () => {
    expect(productImage(png(200, 200)).width).toBe(200);
    expect(() => productImage(png(199, 200))).toThrow(/trop petit/);
  });
});
