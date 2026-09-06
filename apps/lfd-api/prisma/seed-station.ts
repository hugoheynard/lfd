import type { PickupOpening } from "@lfd/contracts";

import { CartAdjustmentMode, type PrismaClient } from "../src/platform/database/client/client.js";

/**
 * **La station** : points de retrait, zones de livraison, heures limites.
 *
 * 🔴 **Rien de tout cela n'était semé.** Les trois routes existent depuis
 * longtemps (`GET /pickup-addresses`, `GET /delivery-zones`,
 * `GET /fulfillment-days`) et rendaient des listes vides sur tout poste de
 * développement. C'est CE VIDE qui a gardé les maquettes en vie côté front — et
 * les maquettes ont coûté trois défauts : une remise en pourcentage là où le
 * serveur sait remettre un montant, des frais en euros flottants, et une grille
 * de créneaux sans journée.
 *
 * Une maquette ne meurt pas parce qu'on la supprime : elle meurt quand la base
 * répond quelque chose. C'est le travail de ce fichier.
 *
 * **Idempotent par le libellé** : ré-exécuté, il ne recrée rien et ne touche pas
 * à ce qui a été modifié à la main. Il n'efface jamais — un poste qui a servi à
 * saisir des cas doit les garder.
 */

/** Les deux fenêtres du labo : les pros avant le four, le public après. */
const LABO_OPENING: PickupOpening = {
  // Trois quarts d'heure AVANT l'ouverture au public, et il y a un trou entre
  // les deux. C'est le cas que la grille de créneaux doit savoir montrer sans
  // l'aplatir — cf. `pickupSlots`.
  proPickup: { start: "05:00", end: "06:30" },
  publicOpening: { start: "07:00", end: "19:00" },
};

/** Le village ne reçoit que du public, et ferme plus tôt. */
const VILLAGE_OPENING: PickupOpening = {
  proPickup: null,
  publicOpening: { start: "08:00", end: "18:00" },
};

interface SeedPoint {
  readonly label: string;
  readonly ligne1: string;
  readonly ville: string;
  readonly codePostal: string;
  readonly isDefault: boolean;
  readonly opening: PickupOpening;
  readonly discount: { mode: CartAdjustmentMode; value: number } | null;
}

const POINTS: readonly SeedPoint[] = [
  {
    label: "Le Labo",
    ligne1: "Route de la Balme",
    ville: "Val d'Isère",
    codePostal: "73150",
    isDefault: true,
    opening: LABO_OPENING,
    // 10 % : `value` est en **points de base** pour un pourcentage. Le second
    // point n'en porte aucune, à dessein — un écran qui n'aurait vu que des
    // points remisés ne montrerait jamais le renoncement.
    discount: { mode: CartAdjustmentMode.percent, value: 1000 },
  },
  {
    label: "Le Village",
    ligne1: "12 avenue Olympique",
    ville: "Val d'Isère",
    codePostal: "73150",
    isDefault: false,
    opening: VILLAGE_OPENING,
    discount: null,
  },
];

interface SeedZone {
  readonly label: string;
  readonly postalPrefixes: readonly string[];
  readonly fee: { mode: CartAdjustmentMode; value: number };
}

const ZONES: readonly SeedZone[] = [
  // Un montant, pas un pourcentage : le coursier coûte la distance, jamais le
  // contenu du panier. `value` est alors en **centimes**.
  {
    label: "Val d'Isère",
    postalPrefixes: ["73150"],
    fee: { mode: CartAdjustmentMode.amount, value: 800 },
  },
  {
    label: "Tignes",
    postalPrefixes: ["73320"],
    fee: { mode: CartAdjustmentMode.amount, value: 1500 },
  },
];

/**
 * Sème la station si elle est absente. Chaque bloc se décide seul : un poste qui
 * a déjà des points mais aucune zone reçoit les zones.
 */
export async function seedStation(prisma: PrismaClient): Promise<void> {
  await seedPickupPoints(prisma);
  await seedDeliveryZones(prisma);
  await seedOrderCutoffs(prisma);
}

async function seedPickupPoints(prisma: PrismaClient): Promise<void> {
  for (const point of POINTS) {
    const existing = await prisma.pickupAddress.findFirst({ where: { label: point.label } });
    if (existing) {
      console.log(`· Point « ${point.label} » déjà présent — inchangé.`);
      continue;
    }
    await prisma.pickupAddress.create({
      data: {
        label: point.label,
        ligne1: point.ligne1,
        ligne2: "",
        codePostal: point.codePostal,
        ville: point.ville,
        pays: "France",
        isDefault: point.isDefault,
        discountMode: point.discount?.mode ?? null,
        discountValue: point.discount?.value ?? null,
        opening: point.opening,
      },
    });
    console.log(`✓ Point de retrait « ${point.label} » semé.`);
  }
}

async function seedDeliveryZones(prisma: PrismaClient): Promise<void> {
  for (const zone of ZONES) {
    const existing = await prisma.deliveryZone.findFirst({ where: { label: zone.label } });
    if (existing) {
      console.log(`· Zone « ${zone.label} » déjà présente — inchangée.`);
      continue;
    }
    await prisma.deliveryZone.create({
      data: {
        label: zone.label,
        postalPrefixes: [...zone.postalPrefixes],
        feeMode: zone.fee.mode,
        feeValue: zone.fee.value,
      },
    });
    console.log(`✓ Zone de livraison « ${zone.label} » semée.`);
  }
}

/**
 * **Une seule règle**, le défaut de la plateforme : commander la veille avant
 * 18 h, une heure de rattrapage.
 *
 * Une seule, et pas une par point : c'est le réglage minimal qui rend
 * `GET /fulfillment-days` intéressant — sans aucune règle il rendrait la journée
 * du jour, ce qui est juste mais ne montre rien.
 */
async function seedOrderCutoffs(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.orderCutoff.findFirst({
    where: { pickupAddressId: null, weekday: null },
  });
  if (existing) {
    console.log("· Heure limite par défaut déjà présente — inchangée.");
    return;
  }
  await prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "18:00", graceMinutes: 60 },
  });
  console.log("✓ Heure limite par défaut semée (veille 18 h, rattrapage 1 h).");
}
