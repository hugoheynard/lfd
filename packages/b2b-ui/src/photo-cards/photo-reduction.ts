/**
 * L'arithmétique de la réduction d'une photo avant l'envoi — séparée du canvas
 * parce qu'un canvas ne se peint pas dans un test, et que c'est ici que vivent
 * les deux décisions qui comptent : la taille, et quand renoncer. Chaque usage
 * les fixe dans sa {@link PhotoReductionPolicy}.
 */

/**
 * Ce qu'un usage exige de ses photos.
 *
 * - `longEdge` : le grand côté, en pixels ; une image plus petite n'est jamais agrandie.
 * - `qualities` : les compressions JPEG essayées, dans l'ordre, de la meilleure à la pire.
 * - `maxBytes` : le poids que le serveur accepte ; au-delà après la dernière passe, on renonce.
 */
export interface PhotoReductionPolicy {
  readonly longEdge: number;
  readonly qualities: readonly number[];
  readonly maxBytes: number;
}

export interface PhotoFrame {
  readonly width: number;
  readonly height: number;
}

/**
 * La taille à laquelle peindre une photo, grand côté borné à `longEdge`.
 *
 * Le rapport est préservé, et une image déjà plus petite n'est **jamais**
 * agrandie : on n'inventerait que du poids.
 */
export function photoFrame(width: number, height: number, longEdge: number): PhotoFrame {
  const edge = Math.max(width, height);
  if (edge <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, longEdge / edge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Peint la photo à cette taille et à cette qualité ; `null` si le navigateur n'a rien rendu. */
export type PhotoEncoder = (frame: PhotoFrame, quality: number) => Promise<Blob | null>;

/** Ce que la réduction rend : la photo prête à partir, ou pourquoi il n'y en a pas. */
export type PhotoReduction =
  | { readonly kind: 'ready'; readonly photo: Blob }
  | { readonly kind: 'too-heavy' }
  | { readonly kind: 'unreadable' };

/**
 * Réduit une photo : une passe par qualité de la politique, la première qui
 * tient sous `maxBytes` gagne.
 *
 * Trop lourde après la dernière passe, elle est **refusée ici** plutôt
 * qu'envoyée : le serveur la refuserait de toute façon, après l'attente du
 * téléversement.
 */
export async function reducePhoto(
  source: PhotoFrame,
  encode: PhotoEncoder,
  policy: PhotoReductionPolicy,
): Promise<PhotoReduction> {
  const frame = photoFrame(source.width, source.height, policy.longEdge);
  if (frame.width === 0) {
    return { kind: 'unreadable' };
  }
  for (const quality of policy.qualities) {
    const photo = await encode(frame, quality);
    if (photo === null) {
      return { kind: 'unreadable' };
    }
    if (photo.size <= policy.maxBytes) {
      return { kind: 'ready', photo };
    }
  }
  return { kind: 'too-heavy' };
}
