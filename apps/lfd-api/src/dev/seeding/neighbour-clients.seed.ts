import { ActivateCompanyByStaffCommand } from "../../b2b/account/application/commands/activate-company.command.js";
import {
  AddDeliveryAddressCommand,
  SaveBillingAddressCommand,
} from "../../b2b/account/application/commands/address-commands.js";
import { AddDeliveryStepCommand } from "../../b2b/account/application/commands/delivery-procedure-commands.js";
import { CreateCompanyCommand } from "../../b2b/account/application/commands/create-company.command.js";
import { GrantTermsCommand } from "../../b2b/account/application/commands/grant-terms.command.js";
import { UpdateMyProfileCommand } from "../../b2b/account/application/commands/update-my-profile.command.js";
import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { CompanyStatus, DeferredTerm, UserStatus } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";

/**
 * **Les voisins du client de référence** — pour que demain ait TROIS clients
 * et aujourd'hui CINQ, et non des commandes d'une même maison (Hugo,
 * 2026-09-28).
 *
 * Une Supervision qui ne montre qu'un client ne montre rien de ce qu'elle sait
 * faire : la recherche qui surligne une commande et SES produits, la file qui
 * mêle deux comptoirs et une livraison. Il faut des maisons différentes, avec
 * des paniers différents.
 *
 * Semés par les mêmes gestes que le client de référence — déclaration,
 * facturation, livraison, terme mensuel, activation par la porte —, mais sans
 * RIB, sans contact ni habitude : ils commandent, et c'est tout ce qu'on leur
 * demande. Le terme mensuel compte : sans lui, leurs commandes attendraient un
 * règlement, et une commande en attente n'est produite pour personne.
 *
 * ⚠️ Leur `auth0Sub` est fictif (`seed|…`) : personne ne s'y connecte. Ce sont
 * des clients qu'on REGARDE depuis le back-office.
 */
export interface NeighbourClient {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly vatNumber: string;
  readonly person: {
    readonly auth0Sub: string;
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly phone: string;
  };
  readonly address: {
    readonly ligne1: string;
    readonly codePostal: string;
    readonly ville: string;
  };
  /** Le point GPS de la livraison — le scénario de tournées de Hugo (2026-09-29). */
  readonly gps: { readonly lat: number; readonly lng: number };
  /**
   * Les consignes du carnet quand elles s'écartent du défaut des voisins
   * ({@link DEFAULT_SITE}) — les clients de la journée de livraison en portent
   * (`delivery-clients.seed.ts`).
   */
  readonly site?: DeliverySite;
}

/** Les consignes d'une adresse de livraison, et sa procédure s'il y en a une. */
export interface DeliverySite {
  /** Le créneau du carnet, tous les jours ; `null` = aucun créneau convenu. */
  readonly slot: { readonly start: string; readonly end: string } | null;
  readonly note: string;
  readonly contact: {
    readonly prenom: string;
    readonly nom: string;
    readonly telephone: string;
  } | null;
  /** `true` exige un contact : le contrat refuse une signature sans personne pour signer. */
  readonly signatureRequired: boolean | null;
  /** Les étapes de la procédure de livraison, dans l'ordre — sans photo. */
  readonly steps: readonly { readonly title: string; readonly body: string }[];
}

/** Ce que les voisins portent depuis toujours : 07:00–09:00, sans consigne. */
const DEFAULT_SITE: DeliverySite = {
  slot: { start: "07:00", end: "09:00" },
  note: "",
  contact: null,
  signatureRequired: null,
  steps: [],
};

/** SIRET et TVA intracommunautaire VALIDES (clé de Luhn, clé TVA du SIREN). */
export const NEIGHBOURS: readonly NeighbourClient[] = [
  {
    raisonSociale: "SARL Chez Marmotte",
    enseigne: "Le Petit Chaudron",
    formeJuridique: "SARL",
    siret: "91234567500017",
    vatNumber: "FR65912345675",
    person: {
      auth0Sub: "seed|chez-marmotte",
      email: "contact@petit-chaudron.test",
      firstName: "Léa",
      lastName: "Rochon",
      phone: "06 21 34 55 90",
    },
    address: { ligne1: "12 rue de la Poste", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4496, lng: 6.9787 },
  },
  {
    raisonSociale: "SAS Hôtellerie du Lac",
    enseigne: "Hôtel Le Lac Blanc",
    formeJuridique: "SAS",
    siret: "88765432500018",
    vatNumber: "FR65887654325",
    person: {
      auth0Sub: "seed|hotel-lac-blanc",
      email: "economat@lac-blanc.test",
      firstName: "Marc",
      lastName: "Vuillet",
      phone: "06 44 18 72 03",
    },
    address: {
      ligne1: "Charmettoger, Arc 1800",
      codePostal: "73700",
      ville: "Bourg-Saint-Maurice",
    },
    gps: { lat: 45.5734, lng: 6.7788 },
  },
  {
    raisonSociale: "SARL Les Grangettes",
    enseigne: "Café des Grangettes",
    formeJuridique: "SARL",
    siret: "83456712500010",
    vatNumber: "FR49834567125",
    person: {
      auth0Sub: "seed|cafe-grangettes",
      email: "bonjour@cafe-grangettes.test",
      firstName: "Inès",
      lastName: "Bochet",
      phone: "06 58 91 23 40",
    },
    address: { ligne1: "Grande Rue", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
    gps: { lat: 45.6186, lng: 6.7695 },
  },
  {
    raisonSociale: "SAS Refuge du Fond",
    enseigne: "Le Refuge du Fond",
    formeJuridique: "SAS",
    siret: "79812345100014",
    vatNumber: "FR55798123451",
    person: {
      auth0Sub: "seed|refuge-du-fond",
      email: "cuisine@refuge-du-fond.test",
      firstName: "Paul",
      lastName: "Genoud",
      phone: "06 77 02 64 15",
    },
    address: { ligne1: "Route du Fornet", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4503, lng: 7.0111 },
  },
];

/** Qui active, au journal — le même auteur que le semis du client de référence. */
const SEED_STAFF_SUB = "seed|dev";

/** Idempotent par raison sociale : une maison déjà semée est laissée telle quelle. */
export async function seedNeighbourClients(context: ClientContext): Promise<void> {
  await seedFictiveClients(context, NEIGHBOURS);
}

/**
 * **Sème des clients fictifs**, chacun par les gestes du client de référence.
 *
 * Exportée pour la journée de livraison (`delivery-clients.seed.ts`) : onze
 * maisons de plus, semées par le MÊME chemin — une copie de ce chemin
 * dériverait au premier durcissement de la porte d'activation, et ce serait
 * alors le semis de livraison seul qui cesserait de l'éprouver.
 *
 * Idempotent par raison sociale : une maison déjà semée est laissée telle quelle
 * — sauf si elle est restée **en attente**. Un semis interrompu entre la
 * création et l'activation laissait des maisons `pending` que le passage
 * suivant sautait pour toujours : comptées comme particuliers, leurs
 * livraisons tombaient sur « la livraison n'est pas proposée pour cet espace »
 * (constaté le 2026-09-30, treize maisons sur quinze).
 */
export async function seedFictiveClients(
  context: ClientContext,
  clients: readonly NeighbourClient[],
): Promise<void> {
  for (const client of clients) {
    const existing = await context.prisma.company.findFirst({
      where: { raisonSociale: client.raisonSociale },
      select: { id: true, status: true },
    });
    if (existing === null) {
      await seedNeighbour(context, client);
    } else if (existing.status === CompanyStatus.pending) {
      await activate(context, existing.id);
      console.log(`✓ Client voisin « ${client.enseigne} » resté en attente — activé.`);
    }
  }
}

async function seedNeighbour(context: ClientContext, neighbour: NeighbourClient): Promise<void> {
  const { prisma, commands, now } = context;
  const { person, address } = neighbour;
  // La personne s'écrit en base, comme pour le client de référence : aucune
  // commande ne crée un utilisateur sans jeton. Son PROFIL passe par la sienne.
  const userId =
    (await prisma.user.findUnique({ where: { auth0Sub: person.auth0Sub } }))?.id ??
    (
      await prisma.user.create({
        data: { auth0Sub: person.auth0Sub, email: person.email, status: UserStatus.active },
        select: { id: true },
      })
    ).id;

  const companyId = await asCustomer(now, userId, async () => {
    await commands.execute(
      new UpdateMyProfileCommand(
        userId,
        person.auth0Sub,
        person.firstName,
        person.lastName,
        person.email,
        person.phone,
      ),
    );
    const id = await commands.execute<CreateCompanyCommand, string>(
      new CreateCompanyCommand(
        userId,
        neighbour.raisonSociale,
        neighbour.enseigne,
        neighbour.formeJuridique,
        neighbour.siret,
        "",
        neighbour.vatNumber,
      ),
    );
    const postal = { ligne2: "", pays: "France", ...address };
    await commands.execute(
      new SaveBillingAddressCommand(userId, id, { label: "Siège", ...postal }),
    );
    const site = neighbour.site ?? DEFAULT_SITE;
    const addressId = await commands.execute<AddDeliveryAddressCommand, string>(
      new AddDeliveryAddressCommand(userId, id, {
        label: neighbour.enseigne,
        ...postal,
        isDefault: true,
        specs: {
          note: site.note,
          slots: { mode: "everyday", slot: site.slot },
          deliveryContact: site.contact,
          gps: neighbour.gps,
          signatureRequired: site.signatureRequired,
        },
      }),
    );
    // La procédure par la commande du gestionnaire, étape par étape, sans
    // photo : c'est le chemin de l'écran, et le seul qui en tient l'ordre.
    for (const step of site.steps) {
      await commands.execute(new AddDeliveryStepCommand(userId, id, addressId, step, null));
    }
    return id;
  });

  await activate(context, companyId);
  console.log(`✓ Client voisin « ${neighbour.enseigne} » semé et activé.`);
}

/** Le terme mensuel, puis la porte d'activation — les gestes du staff. */
async function activate({ commands, now }: ClientContext, companyId: string): Promise<void> {
  await asStaff(now, async () => {
    await commands.execute(new GrantTermsCommand(companyId, [DeferredTerm.monthly]));
    await commands.execute(new ActivateCompanyByStaffCommand(companyId, SEED_STAFF_SUB));
  });
}

function asCustomer<T>(now: Date, userId: string, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now, traceId: newTraceId(), actor: { type: "customer", id: userId } },
    run,
  );
}

function asStaff<T>(now: Date, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now, traceId: newTraceId(), actor: { type: "staff", id: SEED_STAFF_SUB } },
    run,
  );
}
