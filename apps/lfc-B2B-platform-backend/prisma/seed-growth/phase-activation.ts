import type {
  BillingAddressPayload,
  DeliveryAddressPayload,
  UpdateIdentityPayload,
} from "@lfd/contracts";

import {
  AddDeliveryAddressCommand,
  SaveBillingAddressCommand,
} from "../../src/account/application/commands/address-commands.js";
import { ActivateCompanyByStaffCommand } from "../../src/account/application/commands/activate-company.command.js";
import { UpdateCompanyIdentityCommand } from "../../src/account/application/commands/company-settings-commands.js";
import { CreateCompanyCommand } from "../../src/account/application/commands/create-company.command.js";
import { UpdateMyProfileCommand } from "../../src/account/application/commands/update-my-profile.command.js";
import { UploadKbisCommand } from "../../src/account/application/commands/upload-kbis.command.js";
import { customer, SEED_STAFF, SYSTEM, type SeedHarness } from "./harness.js";
import { persona } from "./personas.js";
import type { VerifiedToken } from "../../src/infra/auth/principal.js";

/**
 * Phase **activation** : déclare des sociétés (propriétaires dédiés, index décalé)
 * et fait franchir les pièces à **profondeur décroissante** (`i % 6`) → un
 * entonnoir déclaré → TVA → KBIS → facturation → livraison → activé qui **fuit** à
 * chaque marche (frictions réalistes). Tout via les VRAIS handlers ; KBIS passe par
 * un `KbisStore` factice (stockage non configuré en dev). Backdaté, idempotent
 * (skip si le SIRET existe déjà).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const PDF = Buffer.from("%PDF-1.4\n%seed\n", "latin1");

export async function seedActivation(
  harness: SeedHarness,
  companies: number,
  anchor: Date,
): Promise<number> {
  let created = 0;
  for (let i = 0; i < companies; i += 1) {
    const who = persona(20_000 + i);
    const siret = validSiret(i);
    if ((await harness.prisma.company.findFirst({ where: { siret } })) !== null) {
      continue; // idempotent : société déjà semée.
    }
    // Étalé sur ~26 semaines (0..182 j) pour peupler les fenêtres 13 & 52 sem. du
    // dashboard : des activations avant ET pendant la période → un « +X pts » réel.
    const declaredAt = new Date(anchor.getTime() - ((i * 11) % 182) * DAY_MS);
    const ownerId = await provisionOwner(harness, who, declaredAt);
    if (ownerId === null) {
      continue;
    }
    const companyId = await declare(harness, ownerId, who.businessName, siret, declaredAt);
    if (companyId !== null) {
      await advancePieces(harness, ownerId, companyId, i % 6, who, declaredAt);
      created += 1;
    }
  }
  return created;
}

/** Provisionne le propriétaire + remplit son profil (requis pour déclarer). */
async function provisionOwner(
  harness: SeedHarness,
  who: ReturnType<typeof persona>,
  at: Date,
): Promise<string | null> {
  const token: VerifiedToken = { subject: who.authSub, scopes: [], email: who.email };
  await harness.runAt(at, SYSTEM, () => harness.resolver.resolve(token));
  const user = await harness.prisma.user.findUnique({ where: { auth0Sub: who.authSub } });
  if (user === null) {
    return null;
  }
  const [firstName, lastName] = who.contactName.split(" ");
  await harness.runAt(at, customer(user.id), () =>
    harness.commands.execute<UpdateMyProfileCommand, void>(
      new UpdateMyProfileCommand(
        user.id,
        who.authSub,
        firstName,
        lastName ?? "Nom",
        who.email,
        who.phone,
      ),
    ),
  );
  return user.id;
}

/** Déclare la société (émet `company.declared` self) ; rend son id, ou null si échec. */
async function declare(
  harness: SeedHarness,
  ownerId: string,
  raisonSociale: string,
  siret: string,
  at: Date,
): Promise<string | null> {
  try {
    return await harness.runAt(at, customer(ownerId), () =>
      harness.commands.execute<CreateCompanyCommand, string>(
        new CreateCompanyCommand(ownerId, raisonSociale, "", "SAS", siret, ""),
      ),
    );
  } catch {
    return null;
  }
}

/** Franchit les pièces jusqu'à la profondeur cible (monotone), datées. */
async function advancePieces(
  harness: SeedHarness,
  ownerId: string,
  companyId: string,
  depth: number,
  who: ReturnType<typeof persona>,
  from: Date,
): Promise<void> {
  let when = from;
  const step = async (fn: () => Promise<unknown>): Promise<void> => {
    when = new Date(when.getTime() + 3 * DAY_MS);
    await harness.runAt(when, customer(ownerId), fn);
  };
  if (depth >= 1) {
    const payload: UpdateIdentityPayload = {
      enseigne: "",
      tvaIntracom: `FR${validSiret(1).slice(0, 11)}`,
    };
    await step(() =>
      harness.commands.execute<UpdateCompanyIdentityCommand, void>(
        new UpdateCompanyIdentityCommand(ownerId, companyId, payload),
      ),
    );
  }
  if (depth >= 2) {
    await step(() =>
      harness.commands.execute<UploadKbisCommand, void>(
        new UploadKbisCommand(ownerId, companyId, "kbis.pdf", PDF),
      ),
    );
  }
  if (depth >= 3) {
    await step(() =>
      harness.commands.execute<SaveBillingAddressCommand, void>(
        new SaveBillingAddressCommand(ownerId, companyId, billingPayload(who)),
      ),
    );
  }
  if (depth >= 4) {
    await step(() =>
      harness.commands.execute<AddDeliveryAddressCommand, void>(
        new AddDeliveryAddressCommand(ownerId, companyId, deliveryPayload(who)),
      ),
    );
  }
  if (depth >= 5) {
    when = new Date(when.getTime() + 3 * DAY_MS);
    await harness.runAt(when, SEED_STAFF, () =>
      harness.commands.execute<ActivateCompanyByStaffCommand, void>(
        new ActivateCompanyByStaffCommand(companyId),
      ),
    );
  }
}

/** Rue déterministe, plausible en station (pas de `random`). */
function street(who: ReturnType<typeof persona>): string {
  const ways = ["Front de neige", "Rue de la Poste", "Route des Pistes", "Avenue de la Gare"];
  return `${1 + (who.index % 40)} ${ways[who.index % ways.length]}`;
}

function billingPayload(who: ReturnType<typeof persona>): BillingAddressPayload {
  return {
    label: "Siège",
    ligne1: street(who),
    ligne2: "",
    codePostal: who.codePostal,
    ville: who.ville,
    pays: "France",
  };
}

function deliveryPayload(who: ReturnType<typeof persona>): DeliveryAddressPayload {
  return {
    label: "Livraison",
    ligne1: street(who),
    ligne2: "",
    codePostal: who.codePostal,
    ville: who.ville,
    pays: "France",
    isDefault: true,
    specs: { note: "", slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null },
  };
}

/** SIRET **valide** (14 chiffres, clé de Luhn correcte) et **injectif** par index. */
function validSiret(seed: number): string {
  // 13 chiffres distincts par `seed` (10^12 ≤ base < 10^13), puis la clé de Luhn.
  const base = String(1_000_000_000_000 + seed);
  let sum = 0;
  for (let j = 0; j < 13; j += 1) {
    const positionFromRight = 13 - j;
    let d = Number(base[j]);
    if (positionFromRight % 2 === 1) {
      d *= 2;
      if (d > 9) {
        d -= 9;
      }
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + String(check);
}
