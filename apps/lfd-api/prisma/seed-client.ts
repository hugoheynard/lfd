import {
  AddressKind,
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
  FulfillmentMethod,
  type PrismaClient,
  UserStatus,
} from "../src/platform/database/client/client.js";

/**
 * **Le client de référence** — un seul, complet, et toujours le même.
 *
 * ## Pourquoi un seul
 *
 * La base de développement en portait 250, presque tous synthétiques, et le
 * compte du développeur s'appelait « LFC-TestComp-1 » avec une société vide.
 * Personne ne pouvait dire, en ouvrant un écran, si ce qu'il voyait était le
 * comportement du produit ou un artefact du corpus. Un seul client, réel de
 * bout en bout, rend chaque écran lisible : ce qu'il montre est ce qu'il sait
 * faire.
 *
 * Le corpus synthétique n'est pas perdu — `pnpm seed:growth` le regénère quand
 * on travaille sur les écrans qui en ont besoin (démarchage, cohortes, pertes).
 *
 * ## Ce que « complet » veut dire ici
 *
 * Identité légale, contact principal, un interlocuteur additionnel, terme de
 * règlement accordé, carnet d'adresses (facturation + deux livraisons dans deux
 * zones différentes) et habitude d'acheminement. Tout ce qu'un écran client peut
 * lire a une valeur — un champ vide dans une démo se lit comme une panne.
 *
 * **Idempotent** : ré-exécuté, il ne recrée rien et n'écrase aucune saisie faite
 * à la main. Il n'efface jamais — c'est `reset-customers.ts` qui supprime, et
 * lui seul.
 */

/** La personne. Son `auth0Sub` est celui du poste, surchargeable. */
const AUTH0_SUB = process.env["SEED_AUTH0_SUB"] ?? "auth0|6a6a2fb1a5c185cc18313e33";
const EMAIL = process.env["SEED_EMAIL"] ?? "hheynard@gmail.com";

/**
 * La société. **Sa référence est la clé d'idempotence** de tout le seed : le
 * seed des commandes la cherche par elle, et le reset la protège par elle.
 */
export const CLIENT_REFERENCE = "C-DEV001";

/** L'enseigne, telle qu'elle s'affiche partout où un écran nomme le client. */
export const CLIENT_ENSEIGNE = "La Folie Douce Val d'Isère";

/** Ce que le seed a fait, pour que l'appelant puisse enchaîner. */
export interface SeededClient {
  readonly userId: string;
  readonly companyId: string;
}

export async function seedClient(prisma: PrismaClient): Promise<SeededClient> {
  const user = await seedPerson(prisma);
  const company = await seedCompany(prisma, user.id);
  await seedMembership(prisma, user.id, company.id);
  await seedContact(prisma, company.id);
  await seedAddresses(prisma, company.id);
  await seedHabit(prisma, company.id);
  return { userId: user.id, companyId: company.id };
}

async function seedPerson(prisma: PrismaClient): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { auth0Sub: AUTH0_SUB } });
  if (existing) {
    console.log("· Personne déjà présente — inchangée.");
    return existing;
  }
  const user = await prisma.user.create({
    data: {
      auth0Sub: AUTH0_SUB,
      email: EMAIL,
      firstName: "Hugo",
      lastName: "Heynard",
      phone: "06 12 44 08 71",
      status: UserStatus.active,
    },
  });
  console.log("✓ Personne semée.");
  return user;
}

async function seedCompany(prisma: PrismaClient, ownerId: string): Promise<{ id: string }> {
  const existing = await prisma.company.findUnique({ where: { reference: CLIENT_REFERENCE } });
  if (existing) {
    console.log(`· Société ${CLIENT_REFERENCE} déjà présente — inchangée.`);
    return existing;
  }
  void ownerId;
  const company = await prisma.company.create({
    data: {
      reference: CLIENT_REFERENCE,
      raisonSociale: "SAS Les Tommeuses",
      enseigne: CLIENT_ENSEIGNE,
      formeJuridique: "SAS",
      siret: "812 456 789 00021",
      vatNumber: "FR45812456789",
      // 56.10A — restauration traditionnelle. Le code NAF est une dimension
      // d'analyse commerciale : vide, les écrans de segmentation ne montrent rien.
      nafCode: "56.10A",
      contactPrenom: "Hugo",
      contactNom: "Heynard",
      contactFonction: "Directeur",
      contactEmail: EMAIL,
      contactTelephone: "06 12 44 08 71",
      // Un terme ACCORDÉ, et non demandé : c'est ce qui distingue une facture de
      // fin de mois d'un paiement par carte, et les deux écrans diffèrent.
      grantedTerms: [DeferredTerm.monthly],
      status: CompanyStatus.active,
    },
  });
  console.log(`✓ Société « SAS Les Tommeuses » (${CLIENT_REFERENCE}) semée.`);
  return company;
}

async function seedMembership(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const existing = await prisma.membership.findFirst({ where: { userId, companyId } });
  if (existing) {
    return;
  }
  await prisma.membership.create({
    data: { userId, companyId, role: CustomerRole.owner },
  });
  console.log("✓ Rattachement semé (propriétaire).");
}

/**
 * Un interlocuteur **additionnel**, sans espace utilisateur.
 *
 * Il exerce la distinction que l'écran des contacts porte et que rien d'autre
 * ne montre : un contact n'est pas un utilisateur. Le cabinet comptable reçoit
 * les factures sans jamais ouvrir l'application.
 */
async function seedContact(prisma: PrismaClient, companyId: string): Promise<void> {
  const existing = await prisma.companyContact.findFirst({ where: { companyId } });
  if (existing) {
    return;
  }
  await prisma.companyContact.create({
    data: {
      companyId,
      prenom: "Cabinet",
      nom: "Ferrand",
      fonction: "Comptabilité",
      email: "compta@cabinet-ferrand.fr",
      telephone: "",
      role: CustomerRole.billing,
    },
  });
  console.log("✓ Contact additionnel semé.");
}

/**
 * Le carnet : une facturation, deux livraisons.
 *
 * Les codes postaux sont ceux des zones semées par `seed-station.ts`, et les
 * **deux livraisons ne sont pas dans la même zone** — c'est le seul moyen de
 * voir à l'écran que le tarif suit l'adresse et non le panier.
 */
async function seedAddresses(prisma: PrismaClient, companyId: string): Promise<void> {
  const existing = await prisma.address.findFirst({ where: { companyId } });
  if (existing) {
    console.log("· Carnet d'adresses déjà présent — inchangé.");
    return;
  }
  await prisma.address.createMany({
    data: [
      {
        companyId,
        kind: AddressKind.billing,
        label: "Siège",
        ligne1: "1145 route de la Balme",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      {
        companyId,
        kind: AddressKind.delivery,
        label: "La Folie Douce",
        ligne1: "Sommet du téléphérique de La Daille",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      {
        companyId,
        kind: AddressKind.delivery,
        label: "Le Chalet",
        ligne1: "18 chemin des Barmettes",
        codePostal: "73320",
        ville: "Tignes",
        pays: "France",
      },
    ],
  });
  console.log("✓ Carnet d'adresses semé (1 facturation, 2 livraisons, 2 zones).");
}

/**
 * **Comment cette société est servie d'habitude** — le point de départ de ses
 * commandes, jamais une contrainte.
 *
 * Posé après les adresses parce qu'il les DÉSIGNE. `null` partout n'est pas
 * « retrait » : c'est « rien n'a été dit », et l'écran repose alors la question.
 */
async function seedHabit(prisma: PrismaClient, companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { preferredFulfillmentMethod: true },
  });
  if (company?.preferredFulfillmentMethod !== null) {
    return;
  }
  const delivery = await prisma.address.findFirst({
    where: { companyId, kind: AddressKind.delivery, isDefault: true },
    select: { id: true },
  });
  const labo = await prisma.pickupAddress.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  await prisma.company.update({
    where: { id: companyId },
    data: {
      preferredFulfillmentMethod: FulfillmentMethod.delivery,
      preferredDeliveryAddressId: delivery?.id ?? null,
      preferredPickupAddressId: labo?.id ?? null,
    },
  });
  console.log("✓ Habitude d'acheminement semée (livraison).");
}
