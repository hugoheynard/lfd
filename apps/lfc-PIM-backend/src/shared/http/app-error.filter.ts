import { Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ShopifyAdminError } from '@lfd/shopify-admin';
import type { Response } from 'express';

import {
  AppError,
  ResourceNotFoundError,
  type ErrorCategory,
} from '../errors/app-error.js';

/**
 * Traduction des catégories d'erreur en statuts HTTP.
 *
 * C'est **le seul endroit** du système qui connaît à la fois le domaine et HTTP. Les
 * classes d'erreur, elles, n'ont aucune dépendance au transport — un cron ou un import
 * CSV lève exactement les mêmes. Couvre aussi les erreurs du package transport
 * `@lfd/shopify-admin` (framework-free), rapprochées par leur même `category`/`code`.
 */
const STATUS_BY_CATEGORY: Record<ErrorCategory, HttpStatus> = {
  domain: HttpStatus.BAD_REQUEST,
  business: HttpStatus.CONFLICT,
  technical: HttpStatus.INTERNAL_SERVER_ERROR,
};

@Catch(AppError, ShopifyAdminError)
export class AppErrorFilter implements ExceptionFilter<
  AppError | ShopifyAdminError
> {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(error: AppError | ShopifyAdminError, host: ArgumentsHost): void {
    const status =
      error instanceof ResourceNotFoundError
        ? HttpStatus.NOT_FOUND
        : STATUS_BY_CATEGORY[error.category];

    // Une erreur technique est un incident : elle se trace, et son détail ne sort pas.
    if (error.category === 'technical') {
      this.logger.error(`${error.code} — ${error.message}`, error.stack);
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        code: error.code,
        message:
          error.category === 'technical'
            ? 'Une erreur technique est survenue.'
            : error.message,
      });
  }
}
