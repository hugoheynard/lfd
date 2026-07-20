/**
 * Env minimal pour les tests. Les modules d'infra (DB, Auth) échouent
 * volontairement à l'amorçage si leur configuration manque — les tests
 * fournissent donc des valeurs factices. Aucune ne touche un vrai service :
 * Prisma est stubbé, et les jetons sont vérifiés par un verifier mocké.
 */
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5433/test';
process.env['AUTH0_DOMAIN'] ??= 'test-tenant.eu.auth0.com';
process.env['AUTH0_AUDIENCE'] ??= 'https://api.test.local';
