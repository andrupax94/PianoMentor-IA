// description: Servicio reutilizable de carga (overlay global + bloqueo de botones).
// context: Sustituye al LoadingService DOM original por una versión React-friendly:
// estado reactivo (useSyncExternalStore), hold/unhold, progreso real o manual, y
// busy-keys para bloquear botones hasta que la API responda. SSR-safe.

import { useSyncExternalStore } from "react";

export type LoadingSize = "big" | "mid" | "small";

export interface LoadingOptions {
  size?: LoadingSize;
  opacity?: boolean;
}

export interface LoadingOverlayState {
  visible: boolean;
  percent: number;
  info: string;
  size: LoadingSize;
  opacity: boolean;
}

interface LoaderEntry {
  size: LoadingSize;
  opacity: boolean;
  info: string;
  percent: number;
}

type Listener = () => void;

class LoadingService {
  private listeners = new Set<Listener>();
  private loaders = new Map<string, LoaderEntry>();
  private holdList = new Set<string>();
  private busyKeys = new Set<string>();
  private timers = new Map<string, number>();

  private snapshot: LoadingOverlayState = {
    visible: false,
    percent: 0,
    info: "Cargando",
    size: "mid",
    opacity: false,
  };

  private notify() {
    this.recompute();
    this.listeners.forEach((l) => l());
  }

  private recompute() {
    const entries = [...this.loaders.values()];
    if (entries.length === 0) {
      this.snapshot = { ...this.snapshot, visible: false };
      return;
    }
    const last = entries[entries.length - 1];
    const percent = Math.max(0, ...entries.map((e) => e.percent));
    this.snapshot = {
      visible: true,
      percent,
      info: last.info,
      size: last.size,
      opacity: last.opacity,
    };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  // --- Overlay global ---

  hold(id: string) {
    this.holdList.add(id);
    this.notify();
  }

  unhold(id: string) {
    this.holdList.delete(id);
    this.notify();
  }

  to(id: string, size: LoadingSize = "mid", opacity = false) {
    this.loaders.set(id, { size, opacity, info: "Cargando", percent: 0 });
    this.notify();
  }

  changeInfo(id: string, info: string, percent?: number) {
    const entry = this.loaders.get(id);
    if (!entry) return;
    entry.info = info;
    if (percent !== undefined) {
      entry.percent = Math.max(entry.percent, percent);
    } else if (entry.percent < 90) {
      entry.percent += 10;
    }
    this.loaders.set(id, entry);
    this.notify();
  }

  play(id: string, timer = 10000) {
    if (!this.loaders.has(id)) this.to(id);
    this.clearTimer(id);
    const handle = window.setTimeout(() => this.pause(id), timer);
    this.timers.set(id, handle);
    this.notify();
  }

  pause(id: string) {
    this.changeInfo(id, "Cargando", 100);
    if (this.holdList.has(id)) return;
    this.clearTimer(id);
    const handle = window.setTimeout(() => this.remove(id), 200);
    this.timers.set(id, handle);
  }

  private remove(id: string) {
    this.loaders.delete(id);
    this.clearTimer(id);
    this.notify();
  }

  private clearTimer(id: string) {
    const handle = this.timers.get(id);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(id);
    }
  }

  // --- Busy keys (bloqueo de botones) ---

  start(key: string) {
    this.busyKeys.add(key);
    this.notify();
  }

  stop(key: string) {
    this.busyKeys.delete(key);
    this.notify();
  }

  isBusy(key: string) {
    return this.busyKeys.has(key);
  }

  // --- Helpers para React ---

  isLoading(key?: string) {
    if (key) return this.busyKeys.has(key);
    return this.loaders.size > 0;
  }
}

export const loadingService = new LoadingService();

// Hook para el overlay global
export function useLoading() {
  const snapshot = useSyncExternalStore(
    loadingService.subscribe.bind(loadingService),
    loadingService.getSnapshot.bind(loadingService),
    loadingService.getSnapshot.bind(loadingService),
  );
  return {
    ...snapshot,
    hold: loadingService.hold.bind(loadingService),
    unhold: loadingService.unhold.bind(loadingService),
    to: loadingService.to.bind(loadingService),
    changeInfo: loadingService.changeInfo.bind(loadingService),
    play: loadingService.play.bind(loadingService),
    pause: loadingService.pause.bind(loadingService),
    start: loadingService.start.bind(loadingService),
    stop: loadingService.stop.bind(loadingService),
    isBusy: loadingService.isBusy.bind(loadingService),
  };
}

// Hook para bloquear un botón/acción concreta
export function useBusy(key: string) {
  const loading = useLoading();
  return {
    busy: loading.isBusy(key),
    start: () => loading.start(key),
    stop: () => loading.stop(key),
  };
}
