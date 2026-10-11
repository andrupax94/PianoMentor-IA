// description: Humo del árbol de componentes: todos existen y son funciones.
// context: Criterio de B-006.4; no renderiza (sin DOM en los tests).

import { describe, expect, it, vi } from "vitest";

// El SVG generado con SVGR pesa ~57 KB y su parse es el foco de un fallo
// intermitente del analizador de imports bajo workers; este test solo
// comprueba que los componentes existen, así que se sustituye por un stub.
vi.mock("./PianoStage/Keyboard/SvgKeyboard/PianoVirtual88Pressed", () => ({
  default: () => null,
}));

import { AppHeader } from "./AppHeader/AppHeader";
import { BrandLogo } from "./AppHeader/BrandLogo/BrandLogo";
import { MainNav } from "./AppHeader/MainNav/MainNav";
import { MidiStatus } from "./AppHeader/MidiStatus/MidiStatus";
import { UserAvatar } from "./AppHeader/UserAvatar/UserAvatar";
import { PlayerBar } from "./PlayerBar/PlayerBar";
import { PlaybackControls } from "./PlayerBar/PlaybackControls/PlaybackControls";
import { ProgressBar } from "./PlayerBar/ProgressBar/ProgressBar";
import { SongInfo } from "./PlayerBar/SongInfo/SongInfo";
import { TempoMeasure } from "./PlayerBar/TempoMeasure/TempoMeasure";
import { PianoStage } from "./PianoStage/PianoStage";
import { Keyboard } from "./PianoStage/Keyboard/Keyboard";
import { SvgKeyboard } from "./PianoStage/Keyboard/SvgKeyboard/SvgKeyboard";
import { NoteFallGrid } from "./PianoStage/NoteFallGrid/NoteFallGrid";
import { MentorPanel } from "./MentorPanel/MentorPanel";
import { MentorChat } from "./MentorPanel/MentorChat/MentorChat";
import { ModeSelector } from "./MentorPanel/ModeSelector/ModeSelector";
import { PerformanceStats } from "./MentorPanel/PerformanceStats/PerformanceStats";
import { GaugeChart } from "./MentorPanel/PerformanceStats/GaugeChart/GaugeChart";

const TREE = {
  AppHeader,
  BrandLogo,
  MainNav,
  MidiStatus,
  UserAvatar,
  PlayerBar,
  PlaybackControls,
  ProgressBar,
  SongInfo,
  TempoMeasure,
  PianoStage,
  Keyboard,
  SvgKeyboard,
  NoteFallGrid,
  MentorPanel,
  MentorChat,
  ModeSelector,
  PerformanceStats,
  GaugeChart,
};

describe("component tree", () => {
  it("expone los 19 componentes del armazón", () => {
    expect(Object.keys(TREE)).toHaveLength(19);
    for (const [name, component] of Object.entries(TREE)) {
      expect(typeof component, name).toBe("function");
    }
  });
});
