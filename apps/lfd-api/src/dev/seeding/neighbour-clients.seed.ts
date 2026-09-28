import { ActivateCompanyByStaffCommand } from "../../b2b/account/application/commands/activate-company.command.js";
import {
  AddDeliveryAddressCommand,
  SaveBillingAddressCommand,
} from "../../b2b/account/application/commands/address-commands.js";
import { CreateCompanyCommand } from "../../b2b/account/application/commands/create-company.command.js";
import { GrantTermsCommand } from "../../b2b/account/application/commands/grant-terms.command.js";
import { UpdateMyProfileCommand } from "../../b2b/account/application/commands/update-my-profile.command.js";
import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { DeferredTerm, UserStatus } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";

/**
 * **Deux voisins du client de référence** — pour que la journée de demain ait
 * TROIS clients et non trois commandes d'une même maison (Hugo, 2026-09-28).
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
}

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
    address: { ligne1: "Le Lac", codePostal: "73320", ville: "Tignes" },
  },
];

/** Qui active, au journal — le même auteur que le semis du client de référence. */
const SEED_STAFF_SUB = "seed|dev";

/** Idempotent par raison sociale : une maison déjà semée est laissée telle quelle. */
export async function seedNeighbourClients(context: ClientContext): Promise<void> {
  for (const neighbour of NEIGHBOURS) {
    const existing = await context.prisma.company.findFirst({
      where: { raisonSociale: neighbour.raisonSociale },
      select: { id: true },
    });
    if (existing === null) {
      await seedNeighbour(context, neighbour);
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
    await commands.execute(
      new AddDeliveryAddressCommand(userId, id, {
        label: neighbour.enseigne,
        ...postal,
        isDefault: true,
        specs: {
          note: "",
          slots: { mode: "everyday", slot: { start: "07:00", end: "09:00" } },
          deliveryContact: null,
          gps: null,
          signatureRequired: null,
        },
      }),
    );
    return id;
  });

  await asStaff(now, async () => {
    await commands.execute(new GrantTermsCommand(companyId, [DeferredTerm.monthly]));
    await commands.execute(new ActivateCompanyByStaffCommand(companyId, SEED_STAFF_SUB));
  });
  console.log(`✓ Client voisin « ${neighbour.enseigne} » semé et activé.`);
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
