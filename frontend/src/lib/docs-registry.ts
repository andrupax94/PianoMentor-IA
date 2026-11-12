// description: Registro de documentos publicados en el visor de documentación.
// context: Los .md viven en public/docs y se cargan en el cliente.

export interface DocEntry {
  slug: string;
  title: string;
  group: "Legal" | "Proyecto";
  path: string;
}

export const DOC_ENTRIES: DocEntry[] = [
  { slug: "terminos", title: "Términos y condiciones", group: "Legal", path: "/docs/legal/terminos.md" },
  { slug: "privacidad", title: "Política de privacidad", group: "Legal", path: "/docs/legal/privacidad.md" },
  { slug: "readme", title: "README", group: "Proyecto", path: "/docs/project/readme.md" },
  { slug: "product", title: "Producto (PRODUCT)", group: "Proyecto", path: "/docs/project/product.md" },
  { slug: "glossary", title: "Glosario", group: "Proyecto", path: "/docs/project/glossary.md" },
  { slug: "design", title: "Diseño (DESIGN)", group: "Proyecto", path: "/docs/project/design.md" },
  { slug: "getting-started", title: "Primeros pasos", group: "Proyecto", path: "/docs/project/getting-started.md" },
  { slug: "troubleshooting", title: "Resolución de problemas", group: "Proyecto", path: "/docs/project/troubleshooting.md" },
  { slug: "third-party", title: "Agradecimientos y licencias", group: "Proyecto", path: "/docs/project/third-party-notices.md" },
];

export function findDoc(slug: string): DocEntry | undefined {
  return DOC_ENTRIES.find((doc) => doc.slug === slug);
}
