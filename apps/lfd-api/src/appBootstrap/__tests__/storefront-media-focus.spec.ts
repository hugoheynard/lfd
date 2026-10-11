import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { RefocusStorefrontImageCommand } from "../../b2b/storefront/application/refocus-storefront-image.command.js";
import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedPayloadError,
} from "../../media/channels/carriers/media-asset-described.fact.js";
import type { CatalogueFocal } from "../../pim/channels/media/image-catalogue.js";
import { ImageCatalogue } from "../../pim/channels/media/image-catalogue.js";
import { FocalImageCatalogue } from "../../pim/channels/media/__tests__/focal-image-catalogue.js";
import { RefocusStorefrontOnMediaDescribed } from "../storefront-media-focus.js";

const URL = "https://media.example/fournil.jpg";

describe("RefocusStorefrontOnMediaDescribed — le point focal suit jusqu'à la vitrine (L10)", () => {
  async function subject(focals: ReadonlyMap<string, CatalogueFocal | null>) {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        RefocusStorefrontOnMediaDescribed,
        { provide: ImageCatalogue, useValue: new FocalImageCatalogue(focals) },
        {
          provide: CommandBus,
          useValue: {
            execute: (command: unknown) => {
              sent.push(command);
              return Promise.resolve(1);
            },
          },
        },
      ],
    }).compile();
    return { sent, handler: module.get(RefocusStorefrontOnMediaDescribed) };
  }

  function described(url: string) {
    return { eventId: "evt_1", type: MEDIA_ASSET_DESCRIBED, payload: { url, gestureId: "g_1" } };
  }

  it("relit le point à la médiathèque et le tend à la vitrine par une commande", async () => {
    const { sent, handler } = await subject(new Map([[URL, { x: 0.2, y: 0.9 }]]));

    await handler.handle(described(URL));

    expect(sent).toEqual([new RefocusStorefrontImageCommand(URL, { x: 0.2, y: 0.9 })]);
  });

  it("tend `null` quand personne n'a posé de point : retour au centre", async () => {
    const { sent, handler } = await subject(new Map([[URL, null]]));

    await handler.handle(described(URL));

    expect(sent).toEqual([new RefocusStorefrontImageCommand(URL, null)]);
  });

  it("ne demande rien à la vitrine pour une image sortie du fonds entre-temps", async () => {
    const { sent, handler } = await subject(new Map());

    await handler.handle(described(URL));

    expect(sent).toEqual([]);
  });

  it("une charge hors contrat échoue, visible, sans rien demander à la vitrine", async () => {
    const { sent, handler } = await subject(new Map([[URL, null]]));

    await expect(
      handler.handle({ eventId: "evt_1", type: MEDIA_ASSET_DESCRIBED, payload: {} }),
    ).rejects.toBeInstanceOf(MediaAssetDescribedPayloadError);
    expect(sent).toEqual([]);
  });
});
