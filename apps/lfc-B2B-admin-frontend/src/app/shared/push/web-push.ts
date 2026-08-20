/**
 * Les primitives Web Push, **sans Angular** : des fonctions pures ou presque,
 * pour que la logique délicate — l'état d'abonnement, la conversion de clé —
 * se teste sans DI ni navigateur simulé.
 */

/** Ce que l'écran doit savoir dire à la personne. */
export type PushState =
  /** Le navigateur ne sait pas faire (Safari de bureau ancien, mode privé…). */
  | 'unsupported'
  /** Le serveur n'a pas de paire VAPID : personne ne peut s'abonner. */
  | 'unconfigured'
  /** iOS exige l'installation sur l'écran d'accueil avant tout abonnement. */
  | 'needs-install'
  /** Refusé une fois : le navigateur ne redemandera plus, il faut ses réglages. */
  | 'denied'
  | 'subscribed'
  | 'available';

/**
 * Le navigateur sait-il recevoir des notifications poussées ?
 *
 * Les trois pièces vont ensemble : le service worker les reçoit, `PushManager`
 * abonne, `Notification` affiche. Un navigateur qui n'a que deux des trois ne
 * sert à rien, et c'est le cas de Safari **hors** installation.
 */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * L'app tourne-t-elle **installée** (écran d'accueil, ou coque Capacitor) ?
 *
 * C'est la condition d'iOS : depuis 16.4, Safari accepte Web Push uniquement
 * pour un site ajouté à l'écran d'accueil. Le dire clairement évite un bouton
 * qui échoue sans raison visible — l'échec est silencieux côté Safari.
 *
 * `standalone` (non standard) est la seule voie sur iOS ; la media query
 * couvre Android et les navigateurs de bureau installés.
 */
export function runningInstalled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** iOS impose l'installation ; les autres acceptent depuis un onglet ordinaire. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  // iPadOS se déclare « Macintosh » depuis 13 : l'écran tactile le trahit.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/**
 * Ce que l'écran doit afficher, à partir de faits déjà constatés.
 *
 * Pure — d'où sa testabilité. L'ordre des tests est l'ordre des murs, du plus
 * infranchissable au plus proche de l'action : dire « refusé » à quelqu'un dont
 * le navigateur ne sait pas faire l'enverrait fouiller des réglages inutiles.
 */
export function pushStateOf(facts: {
  readonly supported: boolean;
  readonly publicKey: string | null;
  readonly installed: boolean;
  readonly ios: boolean;
  readonly permission: NotificationPermission;
  readonly subscribed: boolean;
}): PushState {
  if (!facts.supported) {
    return 'unsupported';
  }
  if (facts.publicKey === null) {
    return 'unconfigured';
  }
  if (facts.ios && !facts.installed) {
    return 'needs-install';
  }
  if (facts.permission === 'denied') {
    return 'denied';
  }
  return facts.subscribed ? 'subscribed' : 'available';
}

/**
 * La clé VAPID, du base64url que rend le serveur au `Uint8Array` qu'exige
 * `PushManager.subscribe`.
 *
 * Deux conversions en une : base64**url** (`-`/`_`) vers base64 standard, puis
 * décodage. Le rembourrage est rétabli — `atob` refuse une longueur qui n'est
 * pas un multiple de quatre, et une clé VAPID en fait rarement un.
 *
 * Le type de retour est `Uint8Array<ArrayBuffer>` et non `Uint8Array` tout
 * court : depuis TypeScript 5.7 le second se lit `Uint8Array<ArrayBufferLike>`,
 * qui recouvre aussi la mémoire PARTAGÉE — et `applicationServerKey` la refuse.
 * L'annotation ne contraint rien de plus qu'un fait déjà vrai ici.
 */
export function vapidKeyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * L'abonnement en cours a-t-il été créé avec **cette** clé-là ?
 *
 * Un abonnement de navigateur est scellé à la clé publique qui l'a fabriqué :
 * si le serveur en change, l'ancien ne redeviendra JAMAIS valide — le service
 * de push le refusera en 403, indéfiniment, et rien du côté serveur ne peut le
 * réparer. Seul le navigateur peut en fabriquer un neuf.
 *
 * D'où cette comparaison : elle est ce qui permet de rattraper une rotation
 * sans rien demander à personne. La permission, elle, reste acquise.
 *
 * `options.applicationServerKey` rend la clé telle qu'elle a été fournie, en
 * octets bruts. On compare des octets et non des chaînes : le navigateur ne
 * conserve pas la forme base64url d'origine.
 */
export function matchesServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const used = subscription.options.applicationServerKey;
  if (used === null || used === undefined) {
    return false;
  }
  const expected = vapidKeyToBytes(publicKey);
  const actual = new Uint8Array(used);
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  );
}
