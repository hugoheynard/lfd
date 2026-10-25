import { addressKeyOf } from "../../delivery/domain/services/address-key.js";
import { geocodeFingerprint } from "../../delivery/infrastructure/geocode-fingerprint.js";
import { UpdateDeliveryAvailabilityCommand } from "../../b2b/delivery-availability/application/commands/update-delivery-availability.command.js";
import { asStaff, SEED_STAFF_SUB, type SeedContext, type Target } from "./order-placing.seed.js";

/**
 * **La clientèle particulier du scénario** (2026-10-14) : le client de
 * référence qui commande POUR LUI, sans société — la porte de la boutique,
 * `PlaceOrderCommand` sans `companyId`, donc `clientele = public` et un site
 * sur chaque retrait, comme toute commande d'aujourd'hui.
 *
 * Avant, le poste n'en avait que d'anciennes, passées à la main avant que la
 * commande porte son site (S2) : les écrans de colisage et de retrait
 * coloraient leurs retraits particulier en teinte neutre.
 *
 * ⚠️ Une commande particulier se règle **par carte** : la passation crée une
 * intention chez le prestataire (doublé en e2e), et le semis la marque réglée
 * comme il le fait déjà pour les pros (`paid`) — sans quoi elle attendrait son
 * règlement et ne serait ni au plan, ni au colisage.
 */

/** L'enseigne sous laquelle la journée de livraison vise le particulier. */
export const PERSONAL_ENSEIGNE = "Particulier — client de référence";

/**
 * L'adresse livrée du particulier, dictée à la commande : un particulier n'a
 * pas de carnet (il appartient à une société), d'où l'identité `null`.
 */
const PERSONAL_DELIVERY = {
  id: null,
  postal: {
    label: "Domicile",
    ligne1: "Chemin du Crêt",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
  },
} as const;

/**
 * Le point de l'adresse dictée — inventé, comme ceux des carnets du semis :
 * un chemin du haut de Val d'Isère, qui ne désigne aucune maison connue.
 */
const PERSONAL_DELIVERY_POINT = { lat: 45.4512, lng: 6.9741 } as const;

/** La confiance qu'aurait une réponse sûre du géocodeur — au-dessus de tout seuil. */
const SEEDED_GEOCODE_SCORE = 1;

/**
 * **Situe l'adresse du particulier**, comme la Base Adresse Nationale l'aurait
 * fait : une ligne du cache de géocodage de la livraison, posée à l'instant
 * du semis.
 *
 * ⚠️ C'est la seule écriture hors handler de ce module, et elle a sa raison :
 * une adresse sans carnet n'a de point que par le géocodeur, coupé en dev et
 * en e2e (`BAN_GEOCODER_URL` absent, vérifié le 2026-10-14). Sans elle, la
 * composition automatique la laisse « non située », et le jour arrêté à
 * l'écran du fournil n'atteint pas l'étape des tournées. Le cache n'est qu'un
 * cache : le même écrit que `PrismaGeocodeCacheRepository`, une clé par
 * adresse, rafraîchi à chaque semis.
 */
export async function situatePersonalAddress(context: SeedContext): Promise<void> {
  const fingerprint = geocodeFingerprint(addressKeyOf(PERSONAL_DELIVERY.postal));
  const row = {
    ...PERSONAL_DELIVERY_POINT,
    score: SEEDED_GEOCODE_SCORE,
    geocodedAt: context.now,
  };
  await context.prisma.deliveryGeocode.upsert({
    where: { fingerprint },
    create: { fingerprint, ...row },
    update: row,
  });
}

/** Le même acheteur, pour lui-même : ni société, ni carnet. */
export function personalTargetOf(target: Target): Target {
  return {
    ...target,
    companyId: null,
    defaultDelivery: PERSONAL_DELIVERY,
    deliveries: new Map([[PERSONAL_DELIVERY.postal.label, PERSONAL_DELIVERY]]),
  };
}

/** Une commande sans société se règle par carte : le semis la dit réglée. */
export function isPersonal(target: Target): boolean {
  return target.companyId === null;
}

/**
 * **Ferme la livraison aux particuliers** en développement (Hugo, 2026-10-25 :
 * « livraison particulier doit être désactivée en dev, ça ne peut pas
 * apparaître dans les commandes »), par la commande de l'écran « Livraison ».
 * Rien n'est écrit si elle l'est déjà : un réglage reposé à l'identique
 * écrirait un fait à chaque rechargement.
 */
export async function closeDeliveryToPersonal(context: SeedContext): Promise<void> {
  const current = await context.prisma.deliveryAvailability.findFirst({
    select: { openToB2c: true },
  });
  if (current?.openToB2c !== true) {
    return;
  }
  await asStaff(context.now, () =>
    context.commands.execute(
      new UpdateDeliveryAvailabilityCommand({ openToB2c: false }, SEED_STAFF_SUB),
    ),
  );
}
