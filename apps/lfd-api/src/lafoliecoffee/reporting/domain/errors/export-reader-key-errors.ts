import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le lecteur d'une clé est vide ou trop long. */
export class ExportReaderKeyLabelInvalidError extends DomainError {
  constructor(max: number) {
    super(
      "reporting.export_key.label_invalid",
      `Le lecteur de la clé doit être nommé (par exemple « Direction »), en ${String(max)} signes au plus. Renseignez-le puis recréez la clé.`,
    );
  }
}

/** L'échéance d'une clé neuve n'est pas dans le futur. */
export class ExportReaderKeyExpiryInPastError extends DomainError {
  constructor() {
    super(
      "reporting.export_key.expiry_in_past",
      "L'échéance de la clé est déjà passée : une clé naît vivante. Choisissez une date à venir.",
    );
  }
}

/** Une adresse admise n'est pas une adresse IP lisible. */
export class ExportReaderKeyIpInvalidError extends DomainError {
  constructor(ip: string) {
    super(
      "reporting.export_key.ip_invalid",
      `« ${ip} » n'est pas une adresse IP (IPv4 comme 203.0.113.7, ou IPv6). Corrigez-la, ou laissez la liste vide pour admettre toute adresse.`,
    );
  }
}

/** Le secret tiré est trop court pour être une clé. */
export class ExportReaderKeySecretTooWeakError extends DomainError {
  constructor(min: number) {
    super(
      "reporting.export_key.secret_too_weak",
      `Le secret tiré pour la clé fait moins de ${String(min)} signes : la source d'aléa est mal branchée. Aucune clé n'est créée ; signalez-le à l'équipe technique.`,
    );
  }
}

/** La clé est déjà révoquée. */
export class ExportReaderKeyAlreadyRevokedError extends BusinessError {
  constructor(label: string) {
    super(
      "reporting.export_key.already_revoked",
      `La clé « ${label} » est déjà révoquée : elle n'ouvre plus rien. Rechargez la liste des clés.`,
    );
  }
}

/** Aucune clé sous cet identifiant. */
export class ExportReaderKeyNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "reporting.export_key.not_found",
      `Aucune clé d'export ne porte l'identifiant ${id}. Rechargez la liste des clés.`,
    );
  }
}

/** Une ligne relue contredit les règles de la clé : la base a été écrite à la main. */
export class ExportReaderKeyStateInvalidError extends TechnicalError {
  constructor(id: string, reason: string) {
    super(
      "reporting.export_key.state_invalid",
      `La clé d'export ${id} relue en base est incohérente (${reason}) : révoquez-la à l'écran et créez-en une autre.`,
    );
  }
}

/**
 * La même intention de création est rejouée : la clé existe, mais son secret
 * n'est gardé nulle part et ne peut pas être montré une seconde fois.
 */
export class ExportReaderKeySecretAlreadyShownError extends BusinessError {
  constructor() {
    super(
      "reporting.export_key.secret_already_shown",
      "Cette clé d'export a déjà été créée et son secret montré une fois : il n'est gardé nulle part. Si personne ne l'a noté, révoquez la clé dans la liste et créez-en une nouvelle.",
    );
  }
}
