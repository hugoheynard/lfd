# TODO — le flake des e2e : la cause du 2026-09-22 n'est pas trouvée

> Réduit le 2026-10-19. L'état de ce qui est réglé est dans
> [`e2e-connexions-et-isolation.md`](e2e-connexions-et-isolation.md).

## Ce qui reste

1. **Les deux rouges du 2026-09-22** (`staff-author-conversion` en « timeout
   exceeded when trying to connect », `customer-sheet` en 500, chacun vert
   seul) n'ont **pas** d'explication. L'hypothèse d'une fuite de connexions est
   réfutée par la mesure (pic 21 sur un run complet, retour à 1). Piste non
   vérifiée : la même indisponibilité du serveur au démarrage simultané des
   workers, que `waitForDatabase()` couvre désormais — à confirmer par
   l'absence de récidive, pas par un run vert.
2. **Deux rouges isolés le 2026-10-19**, chacun vert rejoué :
   - `account-alerts` › « la cloche du back-office › sonne quand une alerte se
     déclenche, et se marque lue » : `unread` à 1 au lieu de 0 (run de 20
     suites, avant toute modification). Vert au run suivant et seul. Ressemble
     à une alerte évaluée en tâche de fond après le marquage — non instruit.
   - Run complet : `vitrine-notices`, `activity-pages`,
     `order-account-cancel-history` tombés au **chargement** (`CONTAINER_USAGE_GAPS`
     absent du module `container` d'ops, `OpsHealthService` sans `ContainerUsageService`) :
     un chantier `src/ops/container/` en cours d'écriture dans l'arbre de
     travail au même moment. Sans rapport avec le harnais ; verts rejoués seuls.
