-- Le référentiel produit devient une surface staff à part entière : ses routes
-- (`/pim/*`) sont murées par `@AdminSurface("catalog")`, et l'écran catalogue
-- du back-office quitte `settings` pour la ressource qui le nomme.
--
-- Une valeur d'enum s'AJOUTE, elle ne se renomme pas : les dérogations déjà
-- posées sous `settings` restent valides et gardent leur sens (le paramétrage
-- de la plateforme), et personne ne perd un accès au passage — les rôles qui
-- lisaient `settings` reçoivent `catalog:read` dans la matrice.
ALTER TYPE "public"."StaffResource" ADD VALUE 'catalog';
