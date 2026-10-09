import {
  customerRequestKindFilterSchema,
  type CustomerRequestStatus,
  customerRequestStatusSchema,
  type CustomerRequestView,
  type RequestKind,
} from "@lfd/contracts";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { servePhoto } from "../../shared/photo-cards/http/photo-card-http.js";
import { MarkCustomerRequestHandledCommand } from "../application/commands/mark-customer-request-handled.command.js";
import { GetCustomerRequestPhotoQuery } from "../application/queries/get-customer-request-photo.query.js";
import { ListCustomerRequestsQuery } from "../application/queries/list-customer-requests.query.js";

/**
 * La boîte **« Demandes clients »** au back-office (`/b2b/demandes`), sous
 * `b2b_contact` : la liste filtrée par état et type, « Marquer traité », et
 * les photos — servies ICI, jamais publiques (`demandes-clients.md`, §7).
 */
@Controller("admin/customer-requests")
@AdminSurface("b2b_contact")
export class AdminCustomerRequestsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** `kind` absent = tous les types : la requête du badge et du compteur de menu. */
  @Get()
  list(
    @Query("status", new ZodQuery(customerRequestStatusSchema)) status: CustomerRequestStatus,
    @Query("kind", new ZodQuery(customerRequestKindFilterSchema)) kind: RequestKind | undefined,
  ): Promise<CustomerRequestView[]> {
    return this.queries.execute<ListCustomerRequestsQuery, CustomerRequestView[]>(
      new ListCustomerRequestsQuery(status, kind ?? null),
    );
  }

  @Post(":id/handled")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markHandled(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<MarkCustomerRequestHandledCommand, void>(
      new MarkCustomerRequestHandledCommand(id, staffUserId),
    );
  }

  @Get(":id/photos/:photoId")
  async photo(
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetCustomerRequestPhotoQuery, StoredDocument>(
      new GetCustomerRequestPhotoQuery(id, photoId),
    );
    return servePhoto(res, photo);
  }
}
