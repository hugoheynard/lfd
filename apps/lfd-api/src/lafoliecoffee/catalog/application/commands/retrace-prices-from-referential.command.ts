/**
 * Retrace dans l'historique le prix du référentiel de chaque article vendu
 * dont la dernière trace diffère (lot D, `POST admin/catalog/prices/retrace`).
 * Se lance une fois au déploiement du lot D (runbook), et après l'effacement
 * des prix décidés en dev.
 */
export class RetracePricesFromReferentialCommand {}
