import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { RecordDeliveryNotePrintCommand } from "../application/commands/record-delivery-note-print.command.js";
import {
  type CounterClientNotePdf,
  GetCounterClientNotePdfQuery,
} from "../application/queries/get-counter-client-note-pdf.query.js";

/**
 * **Le bon remis au client, imprimé au comptoir** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, lot L6 ;
 * Hugo, 2026-11-02 : « on doit aussi donner un bon avec le contenu de la
 * commande », chiffré).
 *
 * Sous `handover_counter` — le droit du poste qui remet. La route de l'équipe
 * Commandes (`admin/orders/:orderId/delivery-notes/:number/client.pdf`) reste
 * sous `b2b_orders`, que le vendeur n'a pas — ni la liste des BL : cette
 * route ne demande donc pas de numéro. Elle sert le BL remis du retrait (le
 * plus récent), et répond 404 `delivery_notes.counter.out_of_reach` pour tout
 * autre, 404 `delivery_notes.counter.not_yet` tant que le BL de la remise
 * n'est pas écrit (le mur est dans le handler, `counterNoteReach`).
 *
 * Ouvert dans le navigateur (`inline`) : il s'imprime aussitôt, le client
 * attend devant le vendeur. Comme les autres routes du BL, l'impression est
 * tracée APRÈS la lecture (plan E6, § 14).
 */
@Controller("admin/counter/orders/:orderId/delivery-note")
@AdminSurface("handover_counter")
export class AdminCounterDeliveryNotesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("client.pdf")
  async clientPdf(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetCounterClientNotePdfQuery, CounterClientNotePdf>(
      new GetCounterClientNotePdfQuery(orderId),
    );
    await this.commands.execute<RecordDeliveryNotePrintCommand, void>(
      new RecordDeliveryNotePrintCommand(orderId, pdf.number, staffUserId),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "bon-de-livraison.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
