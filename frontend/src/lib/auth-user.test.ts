// description: Tests del puente de identidad Auth.js → UI (U-005).
// context: Sin DOM ni red: normaliza la sesión cruda de Auth.js a los datos
// que pinta la cabecera (incluido el color de la burbuja).

import { describe, expect, it } from "vitest";

import { toAuthUserInfo, type AuthSessionRaw } from "./auth-user";

const SESSION_WITH_TOKEN: AuthSessionRaw = {
  user: {
    id: "google-sub-123",
    name: "Práctica de Piano",
    email: "practica@gmail.com",
    image: "https://lh3.google/avatar.png",
    color: "#2cbe5a",
  },
  accessToken: "id_token_de_google",
};

describe("toAuthUserInfo", () => {
  it("mapea la sesión completa a los datos que pinta la cabecera", () => {
    const { user, accessToken } = toAuthUserInfo(SESSION_WITH_TOKEN);

    expect(user).toEqual({
      id: "google-sub-123",
      name: "Práctica de Piano",
      email: "practica@gmail.com",
      picture: "https://lh3.google/avatar.png",
      color: "#2cbe5a",
    });
    expect(accessToken).toBe("id_token_de_google");
  });

  it("mantiene el color a null cuando la sesión aún no lo trae", () => {
    const { user } = toAuthUserInfo({
      user: { name: "Alguien", email: "alguien@gmail.com" },
      accessToken: "otro-token",
    });

    expect(user?.color).toBeNull();
    expect(user?.id).toBe("alguien@gmail.com");
  });

  it("devuelve identidad nula sin token (login no completado)", () => {
    const { user, accessToken } = toAuthUserInfo({
      user: { name: "Alguien", email: "alguien@gmail.com" },
      accessToken: null,
    });

    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  it("devuelve identidad nula con sesión vacía", () => {
    const parsed = toAuthUserInfo(null);
    expect(parsed.user).toBeNull();
    expect(parsed.accessToken).toBeNull();
  });
});
