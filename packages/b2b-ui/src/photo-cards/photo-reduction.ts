/**
 * L'arithmétique de la réduction d'une photo avant l'envoi — séparée du canvas
 * parce qu'un canvas ne se peint pas dans un test, et que c'est ici que vivent
 * les deux décisions qui comptent : la taille, et quand renoncer. Chaque usage
 * les fixe dans sa {@link PhotoReductionPolicy}.
 */

/**
 * Une image à produire : sa taille, ses passes, son plafond.
 *
 * - `longEdge` : le grand côté, en pixels ; une image plus petite n'est jamais agrandie.
 * - `qualities` : les compressions JPEG essayées, dans l'ordre, de la meilleure à la pire.
 * - `maxBytes` : le poids que le serveur accepte ; au-delà après la dernière passe, on renonce.
 */
export interface PhotoEncodingPolicy {
  readonly longEdge: number;
  readonly qualities: readonly number[];
  readonly maxBytes: number;
}

/**
 * Ce qu'un usage exige de ses photos : la photo elle-même, et, s'il en veut
 * une, sa **vignette**.
 *
 * La vignette est facultative parce que tous les usages n'en ont pas : la
 * procédure de livraison n'en fabrique pas, les notes du commercial si — leur
 * liste ne charge qu'elles (plan « notes photo du commercial », D7 bis).
 */
export interface PhotoReductionPolicy extends PhotoEncodingPolicy {
  readonly thumbnail?: PhotoEncodingPolicy;
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

/**
 * Ce que la réduction rend : la photo prête à partir — avec sa vignette quand
 * la politique en demande une —, ou pourquoi il n'y en a pas.
 */
export type PhotoReduction =
  | { readonly kind: 'ready'; readonly photo: Blob; readonly thumbnail?: Blob }
  | { readonly kind: 'too-heavy' }
  | { readonly kind: 'unreadable' };

/** Une image encodée, ou pourquoi elle ne l'est pas. */
type Encoded =
  | { readonly kind: 'ready'; readonly photo: Blob }
  | { readonly kind: 'too-heavy' }
  | { readonly kind: 'unreadable' };

/**
 * Réduit une photo : une passe par qualité de la politique, la première qui
 * tient sous `maxBytes` gagne. Puis, si la politique le demande, la même chose
 * pour la vignette — à partir de la **même** source : l'image est décodée une
 * fois, encodée deux fois.
 *
 * Trop lourde après la dernière passe, elle est **refusée ici** plutôt
 * qu'envoyée : le serveur la refuserait de toute façon, après l'attente du
 * téléversement. Une vignette trop lourde refuse la photo entière : l'une ne
 * part pas sans l'autre.
 */
export async function reducePhoto(
  source: PhotoFrame,
  encode: PhotoEncoder,
  policy: PhotoReductionPolicy,
): Promise<PhotoReduction> {
  const photo = await encodeWithin(source, encode, policy);
  if (photo.kind !== 'ready' || policy.thumbnail === undefined) {
    return photo;
  }
  const thumbnail = await encodeWithin(source, encode, policy.thumbnail);
  if (thumbnail.kind !== 'ready') {
    return thumbnail;
  }
  return { kind: 'ready', photo: photo.photo, thumbnail: thumbnail.photo };
}

async function encodeWithin(
  source: PhotoFrame,
  encode: PhotoEncoder,
  policy: PhotoEncodingPolicy,
): Promise<Encoded> {
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
