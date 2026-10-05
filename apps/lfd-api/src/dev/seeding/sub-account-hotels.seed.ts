import { ActivateCompanyByStaffCommand } from "../../b2b/account/application/commands/activate-company.command.js";
import { SaveBillingAddressCommand } from "../../b2b/account/application/commands/address-commands.js";
import { AttachToParentCommand } from "../../b2b/account/application/commands/attach-to-parent.command.js";
import { CreateCompanyCommand } from "../../b2b/account/application/commands/create-company.command.js";
import { FollowParentCommand } from "../../b2b/account/application/commands/follow-parent.command.js";
import { SetGroupWithoutDeliveryCommand } from "../../b2b/account/application/commands/set-group-without-delivery.command.js";
import { CompanyStatus } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";
import { type NeighbourClient, seedFictiveClients } from "./neighbour-clients.seed.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";
import { asCustomer, ensurePerson } from "./sub-account-people.seed.js";

/**
 * **Le groupe hôtelier** — le second cas réel de `plan-sous-comptes.md`
 * (§2.1, « le Club Med ») : deux établissements qui règlent chacun, sous la
 * mercuriale et l'engagement négociés par le groupe.
 *
 * Le groupe est un **compte de groupe, sans livraison** (§4) : il négocie, il
 * ne commande pas. Les hôtels sont des clients complets (SIREN propres) que le
 * staff **rattache** (`AttachToParentCommand`) puis fait suivre `pricing` par
 * la route de la tarification (`FollowParentCommand`, Q9).
 *
 * ⚠️ Rattacher plutôt que « Créer un sous-compte → entité distincte » : une
 * entité s'active avec un détenteur, et le seul geste qui en pose un sur un
 * compte ouvert par le staff (`AttachAccountHolderCommand`) passe par le
 * fournisseur d'identité et le courriel. Le chemin client des voisins donne un
 * détenteur sans rien envoyer — la structure obtenue est la même.
 */
export const HOTEL_GROUP: NeighbourClient = {
  raisonSociale: "SA Groupe Hôtelier des Cimes",
  enseigne: "Groupe Hôtelier des Cimes",
  formeJuridique: "SA",
  siret: "90287341300014",
  vatNumber: "FR11902873413",
  person: {
    auth0Sub: "seed|groupe-cimes",
    email: "achats@groupe-cimes.test",
    firstName: "Bertrand",
    lastName: "Duc",
    phone: "04 79 06 11 20",
  },
  address: { ligne1: "12 quai Charles Ravet", codePostal: "73000", ville: "Chambéry" },
  gps: { lat: 45.5646, lng: 5.9178 },
};

export const HOTELS: readonly NeighbourClient[] = [
  {
    raisonSociale: "SAS Hôtel des Cimes Tignes",
    enseigne: "Hôtel des Cimes Tignes",
    formeJuridique: "SAS",
    siret: "90311782800017",
    vatNumber: "FR33903117828",
    person: {
      auth0Sub: "seed|cimes-tignes",
      email: "economat@cimes-tignes.test",
      firstName: "Nora",
      lastName: "Blanc",
      phone: "06 24 71 90 33",
    },
    address: { ligne1: "Le Lac", codePostal: "73320", ville: "Tignes" },
    gps: { lat: 45.4693, lng: 6.9066 },
  },
  {
    raisonSociale: "SAS Hôtel des Cimes Val Thorens",
    enseigne: "Hôtel des Cimes Val Thorens",
    formeJuridique: "SAS",
    siret: "90356419300014",
    vatNumber: "FR43903564193",
    person: {
      auth0Sub: "seed|cimes-val-thorens",
      email: "economat@cimes-valtho.test",
      firstName: "Yanis",
      lastName: "Rey",
      phone: "06 37 52 08 64",
    },
    address: { ligne1: "Rue du Soleil", codePostal: "73440", ville: "Val Thorens" },
    gps: { lat: 45.2981, lng: 6.5803 },
  },
];

export interface SeededHotels {
  readonly groupId: string;
  /** Les hôtels par enseigne. */
  readonly hotels: ReadonlyMap<string, string>;
}

export async function seedHotelGroup(context: ClientContext): Promise<SeededHotels> {
  const groupId = await seedGroup(context);
  await asStaff(context.now, () =>
    context.commands.execute(new SetGroupWithoutDeliveryCommand(groupId, true)),
  );
  await seedFictiveClients(context, HOTELS);
  const hotels = new Map<string, string>();
  for (const hotel of HOTELS) {
    hotels.set(hotel.enseigne, await attachHotel(context, groupId, hotel));
  }
  return { groupId, hotels };
}

/**
 * Le groupe, par le chemin client — mais SANS adresse de livraison : un
 * compte de groupe n'est jamais livré, et la porte ne l'exige pas.
 */
async function seedGroup(context: ClientContext): Promise<string> {
  const { prisma, commands, now } = context;
  const existing = await prisma.company.findFirst({
    where: { raisonSociale: HOTEL_GROUP.raisonSociale },
    select: { id: true, status: true },
  });
  let groupId = existing?.id ?? null;
  if (groupId === null) {
    const userId = await ensurePerson(context, HOTEL_GROUP.person);
    groupId = await asCustomer(now, userId, async () => {
      const id = await commands.execute<CreateCompanyCommand, string>(
        new CreateCompanyCommand(
          userId,
          HOTEL_GROUP.raisonSociale,
          HOTEL_GROUP.enseigne,
          HOTEL_GROUP.formeJuridique,
          HOTEL_GROUP.siret,
          "",
          HOTEL_GROUP.vatNumber,
        ),
      );
      await commands.execute(
        new SaveBillingAddressCommand(userId, id, {
          label: "Siège",
          ligne2: "",
          pays: "France",
          ...HOTEL_GROUP.address,
        }),
      );
      return id;
    });
  }
  if (existing === null || existing.status === CompanyStatus.pending) {
    const id = groupId;
    await asStaff(now, () =>
      commands.execute(new ActivateCompanyByStaffCommand(id, SEED_STAFF_SUB)),
    );
  }
  return groupId;
}

/** Rattache l'hôtel s'il ne l'est pas, puis lui fait suivre le tarif du groupe. */
async function attachHotel(
  { prisma, commands, now }: ClientContext,
  groupId: string,
  hotel: NeighbourClient,
): Promise<string> {
  const row = await prisma.company.findFirst({
    where: { raisonSociale: hotel.raisonSociale },
    select: { id: true, parentCompanyId: true },
  });
  if (row === null) {
    throw new Error(`« ${hotel.enseigne} » introuvable juste après son semis.`);
  }
  await asStaff(now, async () => {
    if (row.parentCompanyId === null) {
      await commands.execute(new AttachToParentCommand(row.id, groupId));
    }
    // Idempotent dans le handler : suivre ce qu'on suit déjà ne rouvre rien.
    await commands.execute(new FollowParentCommand(row.id, "pricing"));
  });
  return row.id;
}
