# Sources d'icônes natives

`capacitor-assets` génère TOUTES les tailles (iOS, Android, splash) depuis deux
fichiers posés ici :

| Fichier      | Attendu                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| `icon.png`   | **1024 × 1024**, carré, sans marge de sécurité — le bonhomme sur fond crème `#fffdf8` |
| `splash.png` | 2732 × 2732, le bonhomme centré sur l'encre `#12307f`                                 |

⚠️ **Ne pas partir du PNG du site public.** Le logo qu'il sert fait 93 × 120, et
le bonhomme seul 59 × 69 — dix-sept fois trop petit. Une icône d'app agrandie
depuis cette source serait floue sur tous les téléphones. Il faut la source
vectorielle de la marque, ou une page du catalogue rendue à haute définition.

Puis : `pnpm cap:icons`.
