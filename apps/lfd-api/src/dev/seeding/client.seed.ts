import type { CommandBus } from "@nestjs/cqrs";

import { ActivateCompanyByStaffCommand } from "../../b2b/account/application/commands/activate-company.command.js";
import { GrantTermsCommand } from "../../b2b/account/application/commands/admin-company-commands.js";
import {
  AddDeliveryAddressCommand,
  SaveBillingAddressCommand,
} from "../../b2b/account/application/commands/address-commands.js";
import { PreferFulfillmentCommand } from "../../b2b/account/application/commands/company-settings-commands.js";
import { AddCompanyContactCommand } from "../../b2b/account/application/commands/contact-commands.js";
import { CreateCompanyCommand } from "../../b2b/account/application/commands/create-company.command.js";
import { UpdateMyProfileCommand } from "../../b2b/account/application/commands/update-my-profile.command.js";
import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import {
  DeferredTerm,
  type PrismaClient,
  UserStatus,
} from "../../platform/database/client/client.js";

/**
 * **Le client de référence** — un seul, complet, et toujours le même.
 *
 * ## Pourquoi un seul
 *
 * La base de développement en portait 250, presque tous synthétiques, et le
 * compte du développeur s'appelait « LFC-TestComp-1 » avec une société vide.
 * Personne ne pouvait dire, en ouvrant un écran, si ce qu'il voyait était le
 * comportement du produit ou un artefact du corpus. Un seul client, réel de bout
 * en bout, rend chaque écran lisible : ce qu'il montre est ce qu'il sait faire.
 *
 * Le corpus synthétique n'est pas perdu — `pnpm seed:growth` le regénère quand
 * on travaille sur les écrans qui en ont besoin.
 *
 * ## 🔴 Par les COMMANDES, jamais par Prisma
 *
 * Ce module écrivait ses lignes en direct, et c'était deux fautes en une.
 *
 * La première est visible : l'écriture directe enjambe les invariants. Le seed
 * de la station l'a payé le jour même — `isDefault` posé à la main a produit
 * deux points par défaut, un état que le repository rend impossible.
 *
 * La seconde est pire parce qu'elle ne se voit pas : un corpus posé à côté des
 * handlers **n'éprouve rien**. Ici la société suit le vrai pipeline
 * d'onboarding — déclarée, renseignée, dotée de son adresse de facturation, PUIS
 * activée. Si la porte d'activation se durcit demain, ce seed échouera, et c'est
 * exactement le service qu'on lui demande.
 *
 * L'ordre n'est donc pas cosmétique : la porte exige identité légale, détenteur,
 * téléphone, n° de TVA et adresse de facturation. Activer d'abord ne marcherait
 * pas — et c'est la preuve que le chemin est le bon.
 *
 * La **lecture** reste directe : constater qu'une société existe déjà n'engage
 * aucune règle.
 */

/**
 * **Qui est ce client**, côté personne.
 *
 * L'`auth0Sub` compte : c'est lui qui relie le compte semé au jeton que le
 * navigateur présentera, donc ce qui décide si `GET /me` répond « Hugo » ou
 * « inconnu ». Sur un autre poste il diffère, d'où le paramètre.
 *
 * ⚠️ Il n'est PAS lu depuis l'environnement ici : ce module vit dans `src/`, où
 * l'accès direct à `process.env` est interdit — l'environnement se lit par
 * `AppConfig`, et fabriquer une entrée de config pour un seed serait un coût
 * sans contrepartie. C'est l'appelant en ligne de commande qui la lit et la
 * passe.
 */
export interface ClientIdentity {
  readonly auth0Sub: string;
  readonly email: string;
}

/** Le compte du poste de développement, à défaut d'autre indication. */
export const DEFAULT_IDENTITY: ClientIdentity = {
  auth0Sub: "auth0|6a6a2fb1a5c185cc18313e33",
  email: "hheynard@gmail.com",
};

const PHONE = "06 12 44 08 71";

/**
 * La société. **Sa raison sociale est la clé d'idempotence** : la référence
 * (`C-XXXXXX`) est générée par le domaine, donc inconnue avant la création.
 */
export const CLIENT_RAISON_SOCIALE = "SAS Les Tommeuses";

/** L'enseigne, telle qu'elle s'affiche partout où un écran nomme le client. */
export const CLIENT_ENSEIGNE = "La Folie Douce Val d'Isère";

/** Qui active, au journal. Un seed qui activerait anonymement mentirait sur l'auteur. */
const SEED_STAFF_SUB = "seed|dev";

/** Ce dont le semis a besoin : le bus pour écrire, la base pour constater. */
export interface ClientContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
}

/** Ce que le seed a fait, pour que l'appelant puisse enchaîner. */
export interface SeededClient {
  readonly userId: string;
  readonly companyId: string;
  readonly reference: string;
}

export async function seedClient(
  context: ClientContext,
  identity: ClientIdentity = DEFAULT_IDENTITY,
): Promise<SeededClient> {
  const existing = await context.prisma.company.findFirst({
    where: { raisonSociale: CLIENT_RAISON_SOCIALE },
    select: {
      id: true,
      reference: true,
      memberships: { select: { userId: true }, take: 1 },
    },
  });
  if (existing) {
    // 🔴 **La société d'abord, et son propriétaire avec elle.**
    //
    // Ce chemin appelait `seedPerson` en premier, avec l'identité par défaut —
    // celle d'un poste précis. Sur une machine où le client avait été semé avec
    // un autre `auth0Sub` (l'option de la ligne de commande), le rechargement
    // créait donc une SECONDE personne, orpheline, et rendait son identifiant à
    // l'appelant. Les commandes seraient parties au nom de quelqu'un qui n'est
    // membre de rien.
    //
    // La société existante porte déjà son propriétaire : c'est lui qui compte,
    // pas celui qu'on aurait semé.
    const owner = existing.memberships[0]?.userId;
    if (owner === undefined) {
      throw new Error(
        `Société « ${CLIENT_RAISON_SOCIALE} » présente mais sans membre : état incohérent.`,
      );
    }
    console.log(`· Société « ${CLIENT_RAISON_SOCIALE} » déjà présente — inchangée.`);
    return { userId: owner, companyId: existing.id, reference: existing.reference };
  }

  const userId = await seedPerson(context, identity);

  const companyId = await asCustomer(userId, () =>
    context.commands.execute<CreateCompanyCommand, string>(
      new CreateCompanyCommand(
        userId,
        CLIENT_RAISON_SOCIALE,
        CLIENT_ENSEIGNE,
        "SAS",
        "81245678900021",
        "FR45812456789",
      ),
    ),
  );
  console.log(`✓ Société « ${CLIENT_RAISON_SOCIALE} » déclarée.`);

  await seedAddresses(context, userId, companyId);
  await seedContact(context, userId, companyId);
  await seedTerms(context, companyId);
  await seedHabit(context, userId, companyId);
  await activate(context, companyId);

  const company = await context.prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { reference: true },
  });
  return { userId, companyId, reference: company.reference };
}

/**
 * La personne, et son profil.
 *
 * ⚠️ **La création de l'utilisateur reste directe**, et c'est la seule entorse.
 * Le chemin réel est le provisionnement au vol par le résolveur de principal,
 * qui exige un jeton vérifié — donc Auth0. Fabriquer un faux jeton pour semer
 * une personne serait un contournement plus lourd que la ligne qu'il évite. Le
 * PROFIL, lui, passe par sa commande : c'est là que vivent les règles.
 */
async function seedPerson(
  { prisma, commands }: ClientContext,
  identity: ClientIdentity,
): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { auth0Sub: identity.auth0Sub } });
  const userId =
    existing?.id ??
    (
      await prisma.user.create({
        data: { auth0Sub: identity.auth0Sub, email: identity.email, status: UserStatus.active },
        select: { id: true },
      })
    ).id;
  await asCustomer(userId, () =>
    commands.execute<UpdateMyProfileCommand, void>(
      new UpdateMyProfileCommand(
        userId,
        identity.auth0Sub,
        "Hugo",
        "Heynard",
        identity.email,
        PHONE,
      ),
    ),
  );
  console.log(existing ? "· Personne déjà présente — profil reposé." : "✓ Personne semée.");
  return userId;
}

/**
 * Le carnet : une facturation, deux livraisons.
 *
 * La facturation d'ABORD, parce que la porte d'activation l'exige. Les codes
 * postaux sont ceux des zones semées par `station.seed.ts`, et les **deux
 * livraisons ne sont pas dans la même zone** — c'est le seul moyen de voir à
 * l'écran que le tarif suit l'adresse et non le panier.
 */
async function seedAddresses(
  { commands }: ClientContext,
  userId: string,
  companyId: string,
): Promise<void> {
  await asCustomer(userId, async () => {
    await commands.execute<SaveBillingAddressCommand, void>(
      new SaveBillingAddressCommand(userId, companyId, {
        label: "Siège",
        ligne1: "1145 route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      }),
    );
    for (const address of DELIVERIES) {
      await commands.execute<AddDeliveryAddressCommand, string>(
        new AddDeliveryAddressCommand(userId, companyId, address),
      );
    }
  });
  console.log("✓ Carnet d'adresses semé (1 facturation, 2 livraisons, 2 zones).");
}

/** Les deux livraisons. La première est le défaut — le repository le tient. */
const DELIVERIES = [
  {
    label: "La Folie Douce",
    ligne1: "Sommet du téléphérique de La Daille",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
    isDefault: true,
    specs: {
      note: "Livraison par la piste de service, avant l'ouverture des remontées.",
      slots: { mode: "everyday" as const, slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  },
  {
    label: "Le Chalet",
    ligne1: "18 chemin des Barmettes",
    ligne2: "",
    codePostal: "73320",
    ville: "Tignes",
    pays: "France",
    isDefault: false,
    specs: {
      note: "",
      slots: { mode: "everyday" as const, slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  },
];

/**
 * Un interlocuteur **additionnel**, sans espace utilisateur.
 *
 * Il exerce la distinction que l'écran des contacts porte et que rien d'autre ne
 * montre : un contact n'est pas un utilisateur. Le cabinet comptable reçoit les
 * factures sans jamais ouvrir l'application.
 */
async function seedContact(
  { commands }: ClientContext,
  userId: string,
  companyId: string,
): Promise<void> {
  await asCustomer(userId, () =>
    commands.execute<AddCompanyContactCommand, string>(
      new AddCompanyContactCommand(
        userId,
        companyId,
        {
          firstName: "Cabinet",
          lastName: "Ferrand",
          fonction: "Comptabilité",
          email: "compta@cabinet-ferrand.fr",
          phone: "",
        },
        "billing",
      ),
    ),
  );
  console.log("✓ Contact additionnel semé.");
}

/**
 * Le terme de règlement **convenu**, et non demandé.
 *
 * C'est ce qui distingue une facture de fin de mois d'un paiement par carte, et
 * les deux écrans diffèrent. Acte staff : le client ne s'accorde pas un délai.
 */
async function seedTerms({ commands }: ClientContext, companyId: string): Promise<void> {
  await asStaff(() =>
    commands.execute<GrantTermsCommand, void>(
      new GrantTermsCommand(companyId, [DeferredTerm.monthly]),
    ),
  );
  console.log("✓ Terme de règlement accordé (mensuel).");
}

/**
 * **Comment cette société est servie d'habitude** — le point de départ de ses
 * commandes, jamais une contrainte.
 *
 * Posé après les adresses parce qu'il les DÉSIGNE.
 */
async function seedHabit(
  { prisma, commands }: ClientContext,
  userId: string,
  companyId: string,
): Promise<void> {
  const delivery = await prisma.address.findFirst({
    where: { companyId, kind: "delivery", isDefault: true },
    select: { id: true },
  });
  const labo = await prisma.pickupAddress.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  if (delivery === null) {
    return;
  }
  await asCustomer(userId, () =>
    commands.execute<PreferFulfillmentCommand, void>(
      new PreferFulfillmentCommand(userId, companyId, {
        method: "delivery",
        deliveryAddressId: delivery.id,
        pickupAddressId: labo?.id ?? null,
        // Le socle de la société : « on ne demande pas de signature ici ». Une
        // adresse peut y déroger, et c'est de cet écart-là que la commande parle.
        signatureRequired: false,
      }),
    ),
  );
  console.log("✓ Habitude d'acheminement semée (livraison).");
}

/**
 * **L'activation, en dernier** — et c'est le point du module.
 *
 * La porte exige identité légale, détenteur, téléphone, n° de TVA et adresse de
 * facturation. Ce seed les a tous posés avant d'arriver ici ; s'il en oubliait
 * un, il échouerait, et le message dirait lequel. Un `status: "active"` écrit à
 * la main n'aurait rien vérifié.
 */
async function activate({ commands }: ClientContext, companyId: string): Promise<void> {
  await asStaff(() =>
    commands.execute<ActivateCompanyByStaffCommand, void>(
      new ActivateCompanyByStaffCommand(companyId, SEED_STAFF_SUB),
    ),
  );
  console.log("✓ Société activée (par la porte, pas par un statut posé à la main).");
}

/** Le contexte de requête d'un client : sans lui, aucun handler ne sait qui agit. */
function asCustomer<T>(userId: string, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now: new Date(), traceId: newTraceId(), actor: { type: "customer", id: userId } },
    run,
  );
}

/** Le contexte d'un geste staff — activation, terme convenu. */
function asStaff<T>(run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now: new Date(), traceId: newTraceId(), actor: { type: "staff", id: SEED_STAFF_SUB } },
    run,
  );
}
