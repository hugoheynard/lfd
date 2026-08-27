# Sources d'icônes natives

`capacitor-assets` génère toutes les tailles (iOS, Android, écrans de lancement)
depuis ces fichiers. Ne pas les éditer à la main : ils sont **dérivés**, et la
recette ci-dessous les refait à l'identique.

| Fichier                          | Rôle                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `icon.png`                       | 1024², **opaque** — le bonhomme sur le papier de la marque. iOS refuse une icône transparente, le canal alpha est donc retiré, pas seulement rempli.                                             |
| `icon-foreground.png`            | 1024², transparent — l'avant-plan de l'icône adaptative Android. Le bonhomme n'y occupe que la moitié du carré : le système la découpe en cercle ou en écusson, et les bottes sauteraient sinon. |
| `icon-background.png`            | 1024², opaque — l'arrière-plan de la même icône adaptative.                                                                                                                                      |
| `splash.png` / `splash-dark.png` | 2732², opaques — papier et encre.                                                                                                                                                                |

Puis : `pnpm cap:icons`.

## D'où vient le dessin

Du **catalogue professionnel hiver 2026** (PDF), page 1, bloc de marque en bas à
droite — pas du PNG servi par le site public, qui fait 93 × 120 et dont le
bonhomme seul ne mesure que 59 × 69. Dix-sept fois trop petit pour une icône.

La recette, si le logo doit être repris :

1. rendre la page en 4500 × 6000 (`qlmanage -t -s 6000 -o <dossier> <pdf>` —
   aucun outil PDF n'est installé, mais le vignetteur de macOS rend le vectoriel
   à la résolution demandée) ;
2. repérer les **bandes de lignes encrées** dans le quart bas-droit : la
   première est le bonhomme, les suivantes « LA FOLIE », « COFFEE »,
   « PÂTISSERIE », « Par La Folie Douce » ;
3. découper à sa boîte englobante, puis déduire l'alpha de **l'écart au papier**
   plutôt que de seuiller la couleur — c'est ce qui garde l'antialiasing du
   trait au lieu de le hacher.

`public/brand/lfc-mark.png` (227 × 264, transparent) sort de la même découpe :
c'est lui que portent la pastille du chrome et la miniature d'onglet.
