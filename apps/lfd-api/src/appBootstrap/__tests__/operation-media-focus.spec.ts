import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { RefocusOperationImageCommand } from "../../b2b/operations/application/commands/refocus-operation-image.command.js";
import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedPayloadError,
} from "../../media/channels/carriers/media-asset-described.fact.js";
import type { CatalogueFocal } from "../../pim/channels/media/image-catalogue.js";
import { ImageCatalogue } from "../../pim/channels/media/image-catalogue.js";
import { FocalImageCatalogue } from "../../pim/channels/media/__tests__/focal-image-catalogue.js";
import { RefocusCommerceOperationsOnMediaDescribed } from "../operation-media-focus.js";

const URL = "https://media.example/fournil.jpg";

describe("RefocusCommerceOperationsOnMediaDescribed — le point focal suit jusqu'à l'opération du commerce", () => {
  async function subject(focals: ReadonlyMap<string, CatalogueFocal | null>) {
    const sent: unknown[] = [];
    const module = await Test.createTestingModule({
      providers: [
        RefocusCommerceOperationsOnMediaDescribed,
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
    return { sent, handler: module.get(RefocusCommerceOperationsOnMediaDescribed) };
  }

  function described(url: string) {
    return { eventId: "evt_1", type: MEDIA_ASSET_DESCRIBED, payload: { url, gestureId: "g_1" } };
  }

  it("relit le point à la médiathèque et le tend aux opérations du commerce par une commande", async () => {
    const { sent, handler } = await subject(new Map([[URL, { x: 0.2, y: 0.9 }]]));

    await handler.handle(described(URL));

    expect(sent).toEqual([new RefocusOperationImageCommand(URL, { x: 0.2, y: 0.9 })]);
  });

  it("tend `null` quand personne n'a posé de point : retour au centre", async () => {
    const { sent, handler } = await subject(new Map([[URL, null]]));

    await handler.handle(described(URL));

    expect(sent).toEqual([new RefocusOperationImageCommand(URL, null)]);
  });

  it("ne demande rien aux opérations pour une image sortie du fonds entre-temps", async () => {
    const { sent, handler } = await subject(new Map());

    await handler.handle(described(URL));

    expect(sent).toEqual([]);
  });

  it("une charge hors contrat échoue, visible, sans rien demander aux opérations", async () => {
    const { sent, handler } = await subject(new Map([[URL, null]]));

    await expect(
      handler.handle({ eventId: "evt_1", type: MEDIA_ASSET_DESCRIBED, payload: {} }),
    ).rejects.toBeInstanceOf(MediaAssetDescribedPayloadError);
    expect(sent).toEqual([]);
  });
});
