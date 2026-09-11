/**
 * **Lire un QR dans une image vidéo**, par l'API du navigateur.
 *
 * ## Pourquoi aucune bibliothèque
 *
 * `BarcodeDetector` est natif, décode hors du fil principal, et n'ajoute pas un
 * octet au bundle. La seule alternative — un décodeur en JavaScript ou en
 * WebAssembly — coûte quelques centaines de kilo-octets sur une app de
 * back-office, pour un écran qu'on ouvre sur un poste de comptoir dont on
 * choisit le navigateur.
 *
 * ⚠️ Elle n'existe pas partout : Chrome et Edge oui, Firefox et Safari non à ce
 * jour. C'est exactement pour cela que {@link scannerAvailable} est exportée —
 * l'écran le DIT et bascule sur la saisie du numéro, plutôt que d'afficher une
 * caméra qui ne lira jamais rien.
 *
 * ## Le typage, et pourquoi il est écrit ici
 *
 * `BarcodeDetector` n'est pas dans les types du DOM livrés avec TypeScript. On
 * en déclare donc la part qu'on utilise — deux méthodes — plutôt que de caster :
 * un `as unknown as` masquerait le jour où la vraie API change de forme.
 */

interface DetectedBarcode {
  readonly rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly DetectedBarcode[]>;
}

interface BarcodeDetectorCtor {
  new (options: { readonly formats: readonly string[] }): BarcodeDetectorLike;
}

/**
 * La portée globale, telle qu'elle est quand le navigateur sait lire un code.
 *
 * ⚠️ Lue par `Reflect.get` et non par une annotation de type sur `globalThis` :
 * `typeof globalThis` n'a aucune propriété en commun avec une interface qui
 * déclare `BarcodeDetector`, et TypeScript refuse l'affectation — à raison, car
 * elle affirmerait que la propriété est là.
 */
function constructor(): BarcodeDetectorCtor | undefined {
  const found: unknown = Reflect.get(globalThis, 'BarcodeDetector');
  return typeof found === 'function' ? (found as BarcodeDetectorCtor) : undefined;
}

/** Ce navigateur sait-il lire un QR ? À demander AVANT d'allumer la caméra. */
export function scannerAvailable(): boolean {
  return constructor() !== undefined && typeof navigator?.mediaDevices?.getUserMedia === 'function';
}

let detector: BarcodeDetectorLike | null = null;

/**
 * Le contenu du premier QR visible, ou `null` — **jamais une exception**.
 *
 * Une image sans code n'est pas une erreur : c'est l'état normal entre deux
 * clients. L'appelant lit en boucle et n'a rien à rattraper.
 */
export async function readQrCode(source: CanvasImageSource): Promise<string | null> {
  const Detector = constructor();
  if (Detector === undefined) {
    return null;
  }
  detector ??= new Detector({ formats: ['qr_code'] });
  try {
    const codes = await detector.detect(source);
    return codes[0]?.rawValue ?? null;
  } catch {
    // Une image pas encore prête (dimensions nulles au premier tour) lève :
    // on retentera au tour suivant, ce qui est exactement le comportement voulu.
    return null;
  }
}

/**
 * **Le jeton porté par un code lu**, ou `null`.
 *
 * Le QR encode l'URL `…/retrait/<jeton>` ; un code lu ailleurs peut ne porter
 * que le jeton. On accepte les deux — et **rien d'autre**.
 *
 * 🔴 Le refus est le point de cette fonction. Sans lui, un code étranger (une
 * étiquette de transporteur, un badge, un QR de menu) partirait en requête vers
 * l'API avec son contenu dans l'URL. Ce qui n'a pas la forme d'un jeton
 * n'atteint jamais le réseau.
 */
export function tokenOf(scanned: string): string | null {
  const trimmed = scanned.trim();
  if (trimmed === '') {
    return null;
  }
  const inUrl = /\/retrait\/([A-Za-z0-9_-]+)/u.exec(trimmed);
  if (inUrl !== null) {
    return inUrl[1] ?? null;
  }
  return /^[A-Za-z0-9_-]{8,}$/u.test(trimmed) ? trimmed : null;
}
