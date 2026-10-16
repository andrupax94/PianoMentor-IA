// description: Página de la Library: catálogo de piezas y panel de detalle (B-027.3).
// context: Server Component; LibraryPage es cliente y trae el catálogo de la API.
// El item "Library" del nav apunta aquí.

import { AppHeader } from "../../components/AppHeader/AppHeader";
import AppFooter from "../../components/AppFooter/AppFooter";
import { LibraryPage } from "../../components/LibrarySection/LibraryPage/LibraryPage";

export default function LibraryRoute() {
  return (
    <div className="shell">
      <AppHeader active="library" />
      <LibraryPage />
      <AppFooter />
    </div>
  );
}
