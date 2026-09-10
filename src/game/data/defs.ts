import buildingsRaw from './buildings.json';
import unitsRaw from './units.json';
import loreRaw from './lore.json';
import type { BuildingDef, BuildingKind, UnitDef, UnitKind } from '../types';

/** Definições data-driven carregadas dos JSONs (§81). */

export const BUILDING_LIST = buildingsRaw as unknown as BuildingDef[];
export const UNIT_LIST = unitsRaw as unknown as UnitDef[];

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = Object.fromEntries(
  BUILDING_LIST.map((b) => [b.id, b]),
) as Record<BuildingKind, BuildingDef>;

export const UNIT_DEFS: Record<UnitKind, UnitDef> = Object.fromEntries(
  UNIT_LIST.map((u) => [u.id, u]),
) as Record<UnitKind, UnitDef>;

export interface TutorialStepDef {
  id: string;
  title: string;
  text: string;
  hint: string;
}

export interface ChronicleDef {
  id: string;
  title: string;
  text: string;
}

export const LORE = loreRaw as {
  title: string;
  chapter: string;
  intro: string[];
  closing: string;
  tutorial: TutorialStepDef[];
  chronicle: ChronicleDef[];
  statePromotion: { title: string; chapter: string; text: string[]; closing: string };
  decisions: DecisionDef[];
};

/** Demanda que um conselheiro traz ao trono. */
export interface DecisionDef {
  id: string;
  from: 'governor' | 'general';
  title: string;
  text: string;
  require?: {
    minTerritories?: number;
    minSoldiers?: number;
    minCoin?: number;
  };
  options: DecisionOption[];
}

export interface DecisionOption {
  label: string;
  reply: string;
  effects: {
    coin?: number;
    food?: number;
    happiness?: number;
    stability?: number;
    loyalty?: number;
    morale?: number;
    renown?: number;
    units?: Record<string, number>;
  };
}

export const TUTORIAL_STEPS = LORE.tutorial;
