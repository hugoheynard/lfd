/**
 * **La charge rangée dans l'objet est compressée** (gzip), décidé par Hugo le
 * 2026-11-13 : la liste des produits du référentiel frôlait le plafond de
 * l'objet en JSON clair. L'API compresse avant l'envoi et décompresse à la
 * lecture ; l'objet ne range que des octets opaques.
 *
 * `CompressionStream` / `DecompressionStream` sont les flux du standard Web,
 * globaux sous Node 22 comme sous workerd.
 */

/** La charge prête à ranger : ses octets compressés et sa taille en clair. */
export interface PackedContent {
  readonly bytes: Uint8Array;
  readonly rawBytes: number;
}

const GZIP_MAGIC = [0x1f, 0x8b] as const;

/** Compresse un corps JSON. */
export async function packContent(json: string): Promise<PackedContent> {
  const raw = new TextEncoder().encode(json);
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return { bytes, rawBytes: raw.byteLength };
}

/**
 * Le corps JSON d'une charge relue ; `null` si elle est illisible (le
 * lecteur la traite comme un raté).
 *
 * Une charge sans l'en-tête gzip est une entrée rangée en clair avant la
 * compression : elle se lit telle quelle, et le premier rangement la remplace.
 */
export async function unpackContent(bytes: Uint8Array): Promise<string | null> {
  try {
    if (!isGzip(bytes)) {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await new Response(stream).arrayBuffer(),
    );
  } catch {
    return null;
  }
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}
