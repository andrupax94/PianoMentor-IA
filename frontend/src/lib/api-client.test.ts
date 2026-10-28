// description: Tests del cliente HTTP con fetch simulado: éxito, error 400 del backend, caída del servicio, rejilla de compases en la respuesta de notas, los parámetros opcionales with_hands/with_chords de B-009.3 (con ellos y sin ellos), las sesiones de B-012.1 (createSession con el piece_id en el cuerpo y piece_not_found; getSessionState y session_not_found), el chat de B-012.8 (sendAgentMessage enviando mensaje, chat_id y contexto, devolviendo client_action entero, sin chat_id cuando no hay conversación previa y con network_error si el servicio cae), el paso del agente de B-012.6 (runAgentStep enviando el POST al endpoint de la sesión, devolviendo la propuesta completa y network_error si el servicio cae) y el registro por pasos de U-006 (registerUser llama a POST /auth/register con el payload del wizard y propaga los códigos 422/409 del backend).
// context: Criterio de B-004.3, B-012.1, B-012.6 y U-006; se ejecutan con `npm run test` (Vitest).

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createSession,
  getPieceNotes,
  getSessionState,
  previewPiece,
  registerUser,
  runAgentStep,
  sendAgentMessage,
  uploadPiece,
  type AgentChatResponse,
} from "./api-client";

const PIECE_RESPONSE = {
  id: "abc123",
  filename: "fur_elise.mid",
  stored_filename: "abc123",
  size_bytes: 1234,
  extension: ".mid",
  status: "uploaded",
  source: "upload",
  deduplicated: false,
  metadata: {
    tracks: 1,
    duration_seconds: null,
    tempo: null,
    notes_count: null,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadPiece", () => {
  it("devuelve los metadatos cuando el backend responde 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PIECE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], "fur_elise.mid");
    const piece = await uploadPiece(file);

    expect(piece).toEqual(PIECE_RESPONSE);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/pieces$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    const sent = form.get("file") as File;
    expect(sent.name).toBe("fur_elise.mid");
  });

  it("entrega el code y message originales del backend en un 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: "invalid_extension", message: "Extensiones permitidas: .mid, .midi" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1])], "notas.txt");

    await expect(uploadPiece(file)).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_extension",
      message: "Extensiones permitidas: .mid, .midi",
      status: 400,
    });
    await expect(uploadPiece(file)).rejects.toBeInstanceOf(ApiError);
  });

  it("convierte la caída del servicio en un error controlado", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1])], "fur_elise.mid");

    await expect(uploadPiece(file)).rejects.toMatchObject({
      code: "network_error",
      status: null,
    });
  });
});

describe("getPieceNotes", () => {
  const NOTES_RESPONSE = {
    piece_id: "abc123",
    tempo: 120.0,
    duration_seconds: 41.1,
    notes_total: 2,
    from_s: 1.0,
    to_s: 5.0,
    measures: {
      count: 2,
      starts_s: [0, 2],
      signatures: [
        [4, 4],
        [4, 4],
      ],
      end_s: 4,
    },
    notes: [
      { pitch: 60, start_seconds: 1.0, duration_seconds: 0.5, velocity: 80, channel: 0, track: 1 },
      { pitch: 62, start_seconds: 2.0, duration_seconds: 0.5, velocity: 80, channel: 0, track: 1 },
    ],
  };

  it("pide la partitura con la ventana por segundos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(NOTES_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const score = await getPieceNotes("abc123", { from_s: 1.0, to_s: 5.0 });

    expect(score).toEqual(NOTES_RESPONSE);
    expect(score.measures?.count).toBe(2);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/pieces\/abc123\/notes\?/);
    expect(url).toContain("from_s=1");
    expect(url).toContain("to_s=5");
  });

  it("pide manos y acordes cuando se le piden", async () => {
    const enriched = {
      ...NOTES_RESPONSE,
      tracks: [
        {
          track: 1,
          hand: "right",
          note_count: 2,
          channels: [0],
          lowest_pitch: 60,
          highest_pitch: 62,
          median_pitch: 61,
        },
      ],
      chords: [{ start_seconds: 1.0, pitches: [60, 64, 67] }],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(enriched), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const score = await getPieceNotes("abc123", undefined, {
      withHands: true,
      withChords: true,
    });

    expect(score.tracks?.[0].hand).toBe("right");
    expect(score.chords?.[0].pitches).toEqual([60, 64, 67]);
    // Los campos nuevos son opcionales: sin pedirlos la nota no trae mano.
    expect(score.notes[0].hand).toBeUndefined();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("with_hands=true");
    expect(url).toContain("with_chords=true");
  });

  it("no pide nada extra cuando no se le pide", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(NOTES_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPieceNotes("abc123");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain("with_hands");
    expect(url).not.toContain("with_chords");
  });

  it("traduce el 404 de pieza inexistente a piece_not_found", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { code: "piece_not_found", message: "No existe la pieza: xyz" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPieceNotes("xyz")).rejects.toMatchObject({
      code: "piece_not_found",
      status: 404,
    });
  });
});

describe("createSession", () => {
  const SESSION_RESPONSE = { id: "s-1", piece_id: "p01", status: "idle" };

  it("crea la sesión con el piece_id en el cuerpo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SESSION_RESPONSE), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await createSession("p01");

    expect(session).toEqual(SESSION_RESPONSE);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/sessions$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ piece_id: "p01" });
  });

  it("traduce la pieza inexistente a piece_not_found", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { code: "piece_not_found", message: "No existe la pieza: x" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSession("x")).rejects.toMatchObject({
      code: "piece_not_found",
      status: 404,
    });
  });
});

describe("getSessionState", () => {
  const STATE = {
    session_id: "s-1",
    piece_id: "p01",
    status: "playing",
    control: "student",
    current_measure: null,
    position_s: 0,
  };

  it("lee el estado de la sesión", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(STATE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const state = await getSessionState("s-1");

    expect(state).toEqual(STATE);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/sessions\/s-1\/state$/);
  });

  it("traduce la sesión inexistente a session_not_found", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { code: "session_not_found", message: "No existe la sesión: x" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSessionState("x")).rejects.toMatchObject({
      code: "session_not_found",
      status: 404,
    });
  });
});

describe("runAgentStep", () => {
  const STEP = {
    action: "give_hint",
    status: "validated",
    provider: "groq",
    reason: "El alumno omite varias notas.",
    used_fallback: false,
  };

  it("pide el paso del agente por POST al endpoint de la sesión", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(STEP), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const step = await runAgentStep("s-1");

    expect(step).toEqual(STEP);
    expect(step.used_fallback).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/sessions\/s-1\/agent-step$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("traduce la caída del backend en network_error controlado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(runAgentStep("s-1")).rejects.toMatchObject({
      code: "network_error",
    });
  });
});

describe("previewPiece", () => {
  const PREVIEW_RESPONSE = {
    filename: "estudio.mid",
    tempo: 120.0,
    duration_seconds: 30.5,
    notes_total: 1,
    measures: {
      count: 2,
      starts_s: [0, 2],
      signatures: [
        [4, 4],
        [4, 4],
      ],
      end_s: 30.5,
    },
    notes: [
      { pitch: 64, start_seconds: 0.0, duration_seconds: 1.0, velocity: 90, channel: 0, track: 0 },
    ],
  };

  it("envía el archivo y devuelve la partitura efímera sin piece_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PREVIEW_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], "estudio.mid");
    const preview = await previewPiece(file);

    expect(preview).toEqual(PREVIEW_RESPONSE);
    expect(preview).not.toHaveProperty("piece_id");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/pieces\/preview$/);
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("añade manos y acordes a la petición cuando se le piden", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PREVIEW_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], "estudio.mid");
    await previewPiece(file, { withHands: true, withChords: true });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/v1/pieces/preview?");
    expect(url).toContain("with_hands=true");
    expect(url).toContain("with_chords=true");
  });

  it("traduce el rechazo del motor a invalid_midi_content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: "invalid_midi_content", message: "El contenido no es un MIDI legible" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(previewPiece(new File([new Uint8Array([1])], "roto.mid"))).rejects.toMatchObject({
      code: "invalid_midi_content",
      status: 400,
    });
  });
});

describe("sendAgentMessage", () => {
  const CHAT_RESPONSE: AgentChatResponse = {
    chat_id: "chat-1",
    reply: "Cargando el Minueto en Sol en el piano.",
    provider: "groq",
    used_fallback: false,
    client_action: { name: "reproducir_pieza", arguments: { piece_id: "p01" } },
    used_tools: [{ name: "reproducir_pieza", arguments: { piece_id: "p01" } }],
  };

  it("envía el mensaje con la conversación y el contexto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CHAT_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const answer = await sendAgentMessage({
      message: "reproduce el minueto",
      chat_id: "chat-0",
      context: { page: "/" },
    });

    expect(answer).toEqual(CHAT_RESPONSE);
    // La orden del navegador viaja entera: el backend no la ejecuta, solo la decide.
    expect(answer.client_action).toEqual({
      name: "reproducir_pieza",
      arguments: { piece_id: "p01" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/agent\/chat$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      message: "reproduce el minueto",
      chat_id: "chat-0",
      context: { page: "/" },
    });
  });

  it("devuelve client_action nulo cuando el agente solo conversa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...CHAT_RESPONSE,
          reply: "El minueto de Bach se llama Minueto en Sol.",
          client_action: null,
          used_tools: [{ name: "buscar_pieza", arguments: { query: "bach" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const answer = await sendAgentMessage({ message: "¿cómo se llama?", chat_id: null, context: null });

    expect(answer.client_action).toBeNull();
    expect(answer.used_tools[0].name).toBe("buscar_pieza");
  });

  it("sin conversación previa no se manda chat_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CHAT_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendAgentMessage({ message: "hola", context: null });

    // chat_id es opcional: al omitirlo no aparece en el JSON, y el backend
    // lo trata como primer turno.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: "hola", context: null });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("chat_id");
  });

  it("convierte la caída del servicio en un error controlado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(sendAgentMessage({ message: "hola" })).rejects.toMatchObject({
      code: "network_error",
    });
  });
});

describe("registerUser", () => {
  const REGISTER_RESPONSE = { status: "verification_sent", email: "nueva@gmail.com" };

  it("manda el payload del wizard a POST /api/v1/auth/register", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(REGISTER_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const answer = await registerUser({
      email: "nueva@gmail.com",
      password: "contrasena-larga-1234",
      display_name: "Nueva",
      level: "beginner",
      genres: ["Clásica"],
      accepted_terms: true,
    });

    expect(answer).toEqual(REGISTER_RESPONSE);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/register$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      email: "nueva@gmail.com",
      password: "contrasena-larga-1234",
      display_name: "Nueva",
      level: "beginner",
      genres: ["Clásica"],
      accepted_terms: true,
    });
  });

  it("propaga el código 409 de correo ya registrado como ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: "auth_email_exists",
            message: "Este correo ya está registrado. Prueba a iniciar sesión.",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await registerUser({
      email: "nueva@gmail.com",
      password: "contrasena-larga-1234",
      level: "beginner",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("auth_email_exists");
    expect((error as ApiError).status).toBe(409);
  });

  it("propaga los códigos 422 de validación de cada paso", async () => {
    for (const code of ["auth_invalid_email", "auth_weak_password", "auth_invalid_level"]) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: { code, message: "revisado" } }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const error = await registerUser({
        email: "nueva@gmail.com",
        password: "contrasena-larga-1234",
        level: "beginner",
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe(code);
    }
  });

  it("convierte la caída del servicio en un error controlado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      registerUser({
        email: "nueva@gmail.com",
        password: "contrasena-larga-1234",
        level: "beginner",
      }),
    ).rejects.toMatchObject({ code: "network_error" });
  });
});
