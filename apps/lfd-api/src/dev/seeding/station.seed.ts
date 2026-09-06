import {
  type CartAdjustment,
  type DeliveryZonePayload,
  type OrderCutoffPayload,
  type PickupAddressPayload,
  type PickupOpening,
} from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { CreateOrderCutoffCommand } from "../../b2b/order-cutoffs/application/order-cutoff.commands.js";
import { CreatePickupAddressCommand } from "../../b2b/pickup-addresses/application/pickup-address.commands.js";
import { CreateDeliveryZoneCommand } from "../../b2b/delivery-zones/application/delivery-zone.commands.js";
import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **La station** : points de retrait, zones de livraison, heure limite.
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
 * répond quelque chose. C'est le travail de ce module.
 *
 * ## 🔴 Par les COMMANDES, jamais par Prisma
 *
 * Ce seed écrivait ses lignes en direct. Il a fallu une demi-journée pour que ça
 * se paie : `isDefault: true` posé à la main sur un poste qui avait déjà un
 * point par défaut a produit **deux points par défaut**, un état que le
 * repository rend impossible et que l'écriture directe recrée sans rien dire.
 *
 * La règle vaut au-delà de ce cas : un seed qui contourne les handlers ne
 * prépare pas le produit, il prépare une base qui lui ressemble. Chaque
 * invariant qu'il enjambe est un invariant que la démo ne vérifie plus.
 *
 * La lecture, elle, reste directe : constater qu'un point existe déjà n'engage
 * aucune règle, et passer par le bus pour compter des lignes n'apprendrait rien.
 */

/**
 * **Les libellés que ce seed déclare** — sa clé d'idempotence, et la liste que
 * `reset.seed.ts` épargne. Deux usages pour une seule liste : dériver l'une de
 * l'autre est ce qui évite qu'un point semé se fasse retirer au reset suivant.
 */
export const SEEDED_POINT_LABELS: readonly string[] = ["Le Labo", "Le Village"];
export const SEEDED_ZONE_LABELS: readonly string[] = ["Val d'Isère", "Tignes"];

/** Les deux fenêtres du labo/** Les deux fenêtres du labo : les pros avant le four, le public après. */
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
  /** La remise du contrat, pas une paire mode/valeur : c'est ce que le fil porte. */
  readonly discount: CartAdjustment | null;
}

const POINTS: readonly SeedPoint[] = [
  {
    label: "Le Labo",
    ligne1: "Route de la Balme",
    ville: "Val d'Isère",
    codePostal: "73150",
    isDefault: true,
    opening: LABO_OPENING,
    // 10 %, en **points de base**. Le second point n'en porte aucune, à dessein
    // — un écran qui n'aurait vu que des points remisés ne montrerait jamais le
    // renoncement.
    discount: { mode: "percent", bp: 1_000 },
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
  readonly fee: CartAdjustment;
}

const ZONES: readonly SeedZone[] = [
  // Un montant, pas un pourcentage : le coursier coûte la distance, jamais le
  // contenu du panier.
  { label: "Val d'Isère", postalPrefixes: ["73150"], fee: { mode: "amount", cents: 800 } },
  { label: "Tignes", postalPrefixes: ["73320"], fee: { mode: "amount", cents: 1_500 } },
];

/**
 * Sème la station si elle est absente. Chaque bloc se décide seul : un poste qui
 * a déjà des points mais aucune zone reçoit les zones.
 */
/** Ce dont le semis a besoin : le bus pour écrire, la base pour constater. */
export interface StationContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
}

export async function seedStation(context: StationContext): Promise<void> {
  await seedPickupPoints(context);
  await seedDeliveryZones(context);
  await seedOrderCutoffs(context);
}

async function seedPickupPoints({ prisma, commands }: StationContext): Promise<void> {
  for (const point of POINTS) {
    const existing = await prisma.pickupAddress.findFirst({ where: { label: point.label } });
    if (existing) {
      console.log(`· Point « ${point.label} » déjà présent — inchangé.`);
      continue;
    }
    const payload: PickupAddressPayload = {
      label: point.label,
      ligne1: point.ligne1,
      ligne2: "",
      codePostal: point.codePostal,
      ville: point.ville,
      pays: "France",
      // Le repository tranche : le premier point créé devient le défaut, et
      // demander le défaut le déplace proprement. C'est LUI qui tient « un seul
      // à la fois », et c'est pour cela qu'on le laisse décider.
      isDefault: point.isDefault,
      discount: point.discount,
      opening: point.opening,
    };
    await commands.execute(new CreatePickupAddressCommand(payload));
    console.log(`✓ Point de retrait « ${point.label} » semé.`);
  }
}

async function seedDeliveryZones({ prisma, commands }: StationContext): Promise<void> {
  for (const zone of ZONES) {
    const existing = await prisma.deliveryZone.findFirst({ where: { label: zone.label } });
    if (existing) {
      console.log(`· Zone « ${zone.label} » déjà présente — inchangée.`);
      continue;
    }
    const payload: DeliveryZonePayload = {
      label: zone.label,
      postalPrefixes: [...zone.postalPrefixes],
      fee: zone.fee,
    };
    await commands.execute(new CreateDeliveryZoneCommand(payload));
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
async function seedOrderCutoffs({ prisma, commands }: StationContext): Promise<void> {
  const existing = await prisma.orderCutoff.findFirst({
    where: { pickupAddressId: null, weekday: null },
  });
  if (existing) {
    console.log("· Heure limite par défaut déjà présente — inchangée.");
    return;
  }
  const payload: OrderCutoffPayload = {
    pickupAddressId: null,
    weekday: null,
    daysBefore: 1,
    time: "18:00",
    graceMinutes: 60,
  };
  await commands.execute(new CreateOrderCutoffCommand(payload));
  console.log("✓ Heure limite par défaut semée (veille 18 h, rattrapage 1 h).");
}
