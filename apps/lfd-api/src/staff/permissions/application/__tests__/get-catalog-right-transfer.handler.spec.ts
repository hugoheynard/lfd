import {
  CatalogRightTransferReader,
  type CatalogRightOverride,
  type CatalogRightRole,
} from "../../domain/catalog-right-transfer.reader.js";
import { GetCatalogRightTransferHandler } from "../get-catalog-right-transfer.handler.js";

/** Les trois lectures en mémoire, et le compte des appels. */
class InMemoryCatalogRightTransfer extends CatalogRightTransferReader {
  readonly calls: string[] = [];

  constructor(
    private readonly held: readonly CatalogRightRole[],
    private readonly deviations: readonly CatalogRightOverride[],
    private readonly unread: number,
  ) {
    super();
  }

  roles(): Promise<readonly CatalogRightRole[]> {
    this.calls.push("roles");
    return Promise.resolve(this.held);
  }

  catalogOverrides(): Promise<readonly CatalogRightOverride[]> {
    this.calls.push("overrides");
    return Promise.resolve(this.deviations);
  }

  unreadLegacyNotifications(): Promise<number> {
    this.calls.push("notifications");
    return Promise.resolve(this.unread);
  }
}

describe("GetCatalogRightTransferHandler", () => {
  it("assemble les trois lectures en un aperçu", async () => {
    const reader = new InMemoryCatalogRightTransfer(
      [
        {
          key: "commercial",
          label: "Commercial",
          archived: false,
          grants: { b2b_catalog: "write" },
        },
      ],
      [
        {
          staffUserId: "fiche-lea",
          staffName: "Léa Martin",
          resource: "b2b_catalog",
          action: "read",
          effect: "deny",
        },
      ],
      2,
    );

    const view = await new GetCatalogRightTransferHandler(reader).execute();

    expect([...reader.calls].sort()).toEqual(["notifications", "overrides", "roles"]);
    expect(view.roles.map((line) => line.gap)).toEqual(["catalog_missing"]);
    expect(view.overrides.map((line) => line.gap)).toEqual(["revoke_not_copied"]);
    expect(view.unreadLegacyNotifications).toBe(2);
    expect(view.clear).toBe(false);
  });

  it("est sans écart sur une base où personne ne porte l'un ou l'autre", async () => {
    const view = await new GetCatalogRightTransferHandler(
      new InMemoryCatalogRightTransfer([], [], 0),
    ).execute();
    expect(view).toEqual({ roles: [], overrides: [], unreadLegacyNotifications: 0, clear: true });
  });
});
