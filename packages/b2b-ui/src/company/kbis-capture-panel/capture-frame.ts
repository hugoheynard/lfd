/**
 * L'arithmétique de la prise de vue — séparée du composant parce qu'elle a ses
 * propres raisons de changer, et parce qu'une caméra ne s'ouvre pas dans un test.
 */

/**
 * Le grand côté d'une photo envoyée, en pixels.
 *
 * 🔴 Le capteur d'un téléphone récent rend du 4000 px et quelques mégaoctets ;
 * le serveur refuse au-delà de 10 Mo (`ScannedDocument`), et un refus arrive
 * ici APRÈS la photo, avec le client en face et la pièce déjà rangée. On borne
 * donc avant d'envoyer.
 *
 * 2400 px sur le grand côté, c'est environ 200 ppp sur un A4 : un extrait KBIS
 * s'y lit ligne à ligne, SIRET compris. Descendre à 1600 rendait les mentions
 * du greffe illisibles à l'écran de certification — et une pièce qu'on ne peut
 * pas confronter à l'identité ne sert à rien.
 */
export const MAX_LONG_EDGE = 2400;

/**
 * La compression JPEG. 0.85 parce qu'au-delà le fichier double sans qu'un œil
 * y gagne, et qu'en dessous les caractères fins bavent — or c'est précisément
 * ce qu'on vient lire.
 */
export const JPEG_QUALITY = 0.85;

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * La taille à laquelle enregistrer une image, bornée par {@link MAX_LONG_EDGE}.
 *
 * Le rapport est **préservé** : une photo déformée d'un document se certifie
 * mal — on ne sait plus si un caractère est fin ou écrasé. Une image déjà plus
 * petite que la borne n'est jamais agrandie : on n'invente pas des pixels que
 * le capteur n'a pas vus.
 */
export function frameSize(width: number, height: number): FrameSize {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Le nom du fichier déposé.
 *
 * Il porte le jour de la prise de vue : le serveur garde `fileName` tel quel et
 * la fiche l'affiche. « photo.jpg » ne dirait rien à celui qui, six mois plus
 * tard, cherche de quand date l'extrait — et la date de dépôt en base, elle, ne
 * survit pas à une reprise de données.
 */
export function captureFileName(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  const date = `${day.getDate()}`.padStart(2, '0');
  return `kbis-${day.getFullYear()}-${month}-${date}.jpg`;
}
