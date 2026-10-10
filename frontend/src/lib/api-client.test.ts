// description: Tests del cliente HTTP con fetch simulado: éxito y error 400.
// context: Criterio de B-004.3; valida el contrato sin tocar el backend.

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getPieceNotes, uploadPiece } from "./api-client";

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

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/pieces\/abc123\/notes\?/);
    expect(url).toContain("from_s=1");
    expect(url).toContain("to_s=5");
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
