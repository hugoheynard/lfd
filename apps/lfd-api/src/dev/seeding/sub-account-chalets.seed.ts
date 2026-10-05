import type { DeliveryAddressPayload } from "@lfd/contracts";

import { ActivateCompanyByStaffCommand } from "../../b2b/account/application/commands/activate-company.command.js";
import { AddContactByStaffCommand } from "../../b2b/account/application/commands/add-contact-by-staff.command.js";
import { CreateSubAccountCommand } from "../../b2b/account/application/commands/create-sub-account.command.js";
import { UpdateDeliveryAddressByStaffCommand } from "../../b2b/account/application/commands/update-delivery-address-by-staff.command.js";
import { SetCompanyBankAccountCommand } from "../../b2b/payments/application/commands/set-company-bank-account.command.js";
import { SetMandateOptionsCommand } from "../../b2b/payments/application/commands/set-mandate-options.command.js";
import { CompanyStatus } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";
import { type NeighbourClient, seedFictiveClients } from "./neighbour-clients.seed.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";
import { ensureAdminMembership, ensurePerson, type SeedPerson } from "./sub-account-people.seed.js";

/**
 * **Le gestionnaire de chalets privés** — le premier des deux cas réels de
 * `plan-sous-comptes.md` (§2.1) : une société, trois chalets, chacun son
 * adresse et sa gouvernante, tout facturé et prélevé au nom de la société.
 *
 * Le principal suit le chemin des voisins (`seedFictiveClients`) ; les chalets
 * naissent par le geste staff « Créer un sous-compte → Un site de cette
 * société » (`CreateSubAccountCommand`, `billing` suivi d'office, identité
 * vide), puis s'activent par la porte — qui les sait portés par le principal.
 */
export const ALPES_CHALETS: NeighbourClient = {
  raisonSociale: "SAS Alpes Chalets Privés",
  enseigne: "Alpes Chalets Privés",
  formeJuridique: "SAS",
  // SIRET et TVA fictifs mais valides (clé de Luhn, clé TVA du SIREN).
  siret: "90145623600016",
  vatNumber: "FR87901456236",
  person: {
    auth0Sub: "seed|alpes-chalets",
    email: "direction@alpes-chalets.test",
    firstName: "Hélène",
    lastName: "Mollard",
    phone: "06 31 72 48 15",
  },
  address: { ligne1: "45 avenue Olympique", codePostal: "73150", ville: "Val d'Isère" },
  gps: { lat: 45.4486, lng: 6.9806 },
};

/** Un chalet : son adresse de livraison, sa gouvernante, son échéance. */
export interface Chalet {
  readonly enseigne: string;
  readonly address: {
    readonly ligne1: string;
    readonly codePostal: string;
    readonly ville: string;
  };
  readonly gps: { readonly lat: number; readonly lng: number };
  readonly deadline: string;
  readonly housekeeper: SeedPerson;
}

export const CHALETS: readonly Chalet[] = [
  {
    enseigne: "Chalet Edelweiss",
    address: { ligne1: "Chemin du Crêt", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4441, lng: 6.9712 },
    deadline: "08:00",
    housekeeper: {
      auth0Sub: "seed|chalet-edelweiss",
      email: "gouvernante@chalet-edelweiss.test",
      firstName: "Sophie",
      lastName: "Arnaud",
      phone: "06 12 87 34 01",
    },
  },
  {
    enseigne: "Chalet Mélèze",
    address: { ligne1: "Route de la Daille", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4593, lng: 6.9628 },
    deadline: "08:30",
    housekeeper: {
      auth0Sub: "seed|chalet-meleze",
      email: "gouvernante@chalet-meleze.test",
      firstName: "Camille",
      lastName: "Perrier",
      phone: "06 45 19 62 77",
    },
  },
  {
    enseigne: "Chalet Arolle",
    address: { ligne1: "Les Almes", codePostal: "73320", ville: "Tignes" },
    gps: { lat: 45.4684, lng: 6.9093 },
    deadline: "09:00",
    housekeeper: {
      auth0Sub: "seed|chalet-arolle",
      email: "gouvernante@chalet-arolle.test",
      firstName: "Julie",
      lastName: "Favre",
      phone: "06 58 03 21 94",
    },
  },
];

/** Ce que le semis des chalets rend : le principal, puis chaque chalet par enseigne. */
export interface SeededChalets {
  readonly principalId: string;
  readonly chalets: ReadonlyMap<string, string>;
}

/**
 * ⚠️ **IBAN de remplissage**, clé RIB et clé mod-97 valides, banque et guichet
 * `00000` : aucun établissement réel. Distinct de celui du client de référence,
 * pour qu'on ne confonde pas les deux sur un mandat imprimé.
 */
const ALPES_IBAN = "FR7600000000000009876543201";
const FILLER_BIC = "BANQFRPPXXX";

export async function seedAlpesChalets(context: ClientContext): Promise<SeededChalets> {
  await seedFictiveClients(context, [ALPES_CHALETS]);
  const principal = await context.prisma.company.findFirst({
    where: { raisonSociale: ALPES_CHALETS.raisonSociale },
    select: { id: true, reference: true },
  });
  if (principal === null) {
    throw new Error(`« ${ALPES_CHALETS.enseigne} » introuvable juste après son semis.`);
  }
  await seedPrincipalBankAccount(context, principal.id, principal.reference);
  const chalets = new Map<string, string>();
  for (const chalet of CHALETS) {
    chalets.set(chalet.enseigne, await seedChalet(context, principal.id, chalet));
  }
  return { principalId: principal.id, chalets };
}

/** Le RIB du principal — celui sur lequel tous les chalets seront prélevés (S4). */
async function seedPrincipalBankAccount(
  { prisma, commands, now }: ClientContext,
  companyId: string,
  reference: string,
): Promise<void> {
  const existing = await prisma.companyBankAccount.findUnique({
    where: { companyId },
    select: { id: true },
  });
  if (existing !== null) {
    return;
  }
  await asStaff(now, async () => {
    await commands.execute(
      new SetCompanyBankAccountCommand(companyId, {
        iban: ALPES_IBAN,
        bic: FILLER_BIC,
        // La raison sociale : c'est ce que la banque connaît.
        holder: ALPES_CHALETS.raisonSociale,
        line1: ALPES_CHALETS.address.ligne1,
        line2: "",
        postalCode: ALPES_CHALETS.address.codePostal,
        city: ALPES_CHALETS.address.ville,
        countryCode: "FR",
      }),
    );
    await commands.execute(
      new SetMandateOptionsCommand(companyId, { debtorReference: reference, contractNumber: "" }),
    );
  });
}

/**
 * Un chalet : créé s'il manque (clé : son enseigne sous ce principal),
 * réaligné sinon. Puis sa gouvernante, son contact joignable, et la porte.
 */
async function seedChalet(
  context: ClientContext,
  principalId: string,
  chalet: Chalet,
): Promise<string> {
  const { prisma, commands, now } = context;
  const existing = await prisma.company.findFirst({
    where: { parentCompanyId: principalId, enseigne: chalet.enseigne },
    select: { id: true },
  });
  const companyId =
    existing?.id ??
    (await asStaff(now, () =>
      commands.execute<CreateSubAccountCommand, string>(
        new CreateSubAccountCommand(
          principalId,
          {
            raisonSociale: "",
            enseigne: chalet.enseigne,
            formeJuridique: "",
            siret: "",
            siren: "",
            vatNumber: "",
            deliveryAddress: deliveryAddressOf(chalet),
            follows: ["billing"],
          },
          false,
        ),
      ),
    ));
  if (existing !== null) {
    await realignDeliveryAddress(context, companyId, chalet);
  }
  const userId = await ensurePerson(context, chalet.housekeeper);
  await ensureAdminMembership(context, userId, companyId);
  await ensureReachable(context, companyId, chalet.housekeeper);
  await activateSite(context, companyId);
  return companyId;
}

function deliveryAddressOf(chalet: Chalet): DeliveryAddressPayload {
  const { housekeeper } = chalet;
  return {
    label: chalet.enseigne,
    ligne2: "",
    pays: "France",
    ...chalet.address,
    isDefault: true,
    specs: {
      note: "Livrer par l'entrée de service, côté garage.",
      slots: { mode: "everyday", slot: null },
      deadlines: { mode: "everyday", times: [chalet.deadline] },
      deliveryContact: {
        prenom: housekeeper.firstName,
        nom: housekeeper.lastName,
        telephone: housekeeper.phone,
      },
      gps: chalet.gps,
      signatureRequired: null,
    },
  };
}

/** L'adresse par défaut reposée sur sa description, par le geste du staff. */
async function realignDeliveryAddress(
  { prisma, commands, now }: ClientContext,
  companyId: string,
  chalet: Chalet,
): Promise<void> {
  const address = await prisma.address.findFirst({
    where: { companyId, kind: "delivery", isDefault: true, archivedAt: null },
    select: { id: true },
  });
  if (address === null) {
    return;
  }
  await asStaff(now, () =>
    commands.execute(
      new UpdateDeliveryAddressByStaffCommand(companyId, address.id, deliveryAddressOf(chalet)),
    ),
  );
}

/** La porte exige un numéro : la gouvernante en interlocutrice, une seule fois. */
async function ensureReachable(
  { prisma, commands, now }: ClientContext,
  companyId: string,
  person: SeedPerson,
): Promise<void> {
  const contacts = await prisma.companyContact.count({ where: { companyId } });
  if (contacts > 0) {
    return;
  }
  await asStaff(now, () =>
    commands.execute(
      new AddContactByStaffCommand(
        companyId,
        {
          firstName: person.firstName,
          lastName: person.lastName,
          fonction: "Gouvernante",
          email: person.email,
          phone: person.phone,
        },
        "admin",
      ),
    ),
  );
}

/**
 * La porte du site.
 *
 * Aucun terme n'est accordé AU CHALET : depuis S4, la passation lit les
 * termes du PAYEUR (`order-settlement.ts`, `accountStanding`), et le chalet
 * commande au compte de son principal. Le contournement daté qui lui
 * accordait le mensuel a été retiré au lot S4 (plan-sous-comptes, T44).
 */
async function activateSite({ prisma, commands, now }: ClientContext, companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { status: true },
  });
  if (company?.status === CompanyStatus.pending) {
    await asStaff(now, () =>
      commands.execute(new ActivateCompanyByStaffCommand(companyId, SEED_STAFF_SUB)),
    );
  }
}
