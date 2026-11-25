/**
 * E2E **le carnet des adresses de livraison de Tour manager**
 * (`GET /admin/delivery/address-book`).
 *
 * Ce que seul le vrai SQL prouve :
 * - seules les adresses de LIVRAISON encore au carnet sortent : ni la
 *   facturation, ni une adresse archivée, ni celle d'une société supprimée ;
 * - le tri est celui de la base : client, puis libellé ;
 * - la porte, le stationnement et la note sont lus du carnet ;
 * - le mur des droits : `delivery_rounds:read` lit, un autre droit 403.
 */
import type { DeliveryAddressBookView } from "@lfd/contracts";

import { staffWithRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, createCompany } from "./factories.js";

const BOOK = "/admin/delivery/address-book";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function deliveryAddress(
  companyId: string,
  label: string,
  extra: { readonly archived?: boolean; readonly specs?: object } = {},
): Promise<string> {
  const created = await ctx.prisma.address.create({
    data: {
      companyId,
      kind: "delivery",
      label,
      ligne1: "1 rue du Port",
      codePostal: "73000",
      ville: "Chambéry",
      pays: "France",
      parkingLat: 45.57,
      parkingLng: 5.92,
      ...(extra.specs === undefined ? {} : { deliverySpecs: extra.specs }),
      ...(extra.archived === true ? { archivedAt: new Date(0) } : {}),
    },
    select: { id: true },
  });
  return created.id;
}

async function roleWith(key: string, resource: string, action: "read" | "write"): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants: [{ resource, action }] })
    .expect(201);
}

describe("GET /admin/delivery/address-book", () => {
  it("rend les adresses de livraison vivantes, triées client puis libellé", async () => {
    const beta = await createCompany(ctx.prisma, { raisonSociale: "Bêta SARL" });
    const alpha = await createCompany(ctx.prisma, { raisonSociale: "Alpha SAS" });
    await ctx.prisma.company.update({
      where: { id: alpha.id },
      data: { enseigne: "Le Comptoir Alpha" },
    });
    const gone = await createCompany(ctx.prisma, { raisonSociale: "Aaa supprimée" });
    await ctx.prisma.company.update({
      where: { id: gone.id },
      data: { archivedAt: new Date(0), archiveReason: "Compte supprimé" },
    });
    await addBillingAddress(ctx.prisma, alpha.id);
    await deliveryAddress(gone.id, "Fantôme");
    await deliveryAddress(alpha.id, "Ancienne", { archived: true });
    await deliveryAddress(beta.id, "Entrepôt");
    await deliveryAddress(alpha.id, "Zinc");
    const door = await deliveryAddress(alpha.id, "Comptoir", {
      specs: {
        note: "Sonner à l'arrière",
        deliveryContact: null,
        gps: { lat: 45.571, lng: 5.921 },
        stopMinutes: 6,
        slotList: { mode: "everyday", slots: [] },
      },
    });
    await roleWith("lecteur-tournees", "delivery_rounds", "read");
    const reader = await staffWithRole(ctx, "lecteur-1", "lecteur-tournees");

    const view = jsonBody<DeliveryAddressBookView>(await reader.agent.get(BOOK).expect(200));

    expect(view.addresses.map((a) => [a.tradeName, a.legalName, a.addressLabel])).toEqual([
      ["Le Comptoir Alpha", "Alpha SAS", "Comptoir"],
      ["Le Comptoir Alpha", "Alpha SAS", "Zinc"],
      ["", "Bêta SARL", "Entrepôt"],
    ]);
    expect(view.addresses[0]).toMatchObject({
      addressId: door,
      door: { lat: 45.571, lng: 5.921 },
      parking: { lat: 45.57, lng: 5.92 },
      note: "Sonner à l'arrière",
      stopMinutes: 6,
      hasProcedure: false,
    });
    expect(view.addresses[1]).toMatchObject({ door: null, note: "", stopMinutes: null });
  });

  it("sans `delivery_rounds:read` : 403", async () => {
    await roleWith("comptoir-seul", "handover_counter", "write");
    const other = await staffWithRole(ctx, "comptoir-1", "comptoir-seul");

    await other.agent.get(BOOK).expect(403);
  });
});
