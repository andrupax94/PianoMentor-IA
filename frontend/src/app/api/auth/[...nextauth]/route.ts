// description: Route handler de Auth.js: /api/auth/signin|signout|callback|session|csrf (U-005).
// context: Único punto HTTP del frontend para el flujo de Google; las URIs de
// redirección configuradas en Google Cloud apuntan a /api/auth/callback/google.

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
