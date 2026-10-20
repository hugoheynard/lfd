import { DiskBrandLogoSource } from "../disk-brand-logo.source.js";

describe("DiskBrandLogoSource", () => {
  it("lit le logo du dépôt depuis le dossier de l'app, en PNG", async () => {
    const logo = await new DiskBrandLogoSource().load();

    expect(logo.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
