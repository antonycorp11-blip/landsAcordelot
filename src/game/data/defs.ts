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

export const LORE = loreRaw as {
  title: string;
  chapter: string;
  intro: string[];
  closing: string;
  tutorial: TutorialStepDef[];
};

export const TUTORIAL_STEPS = LORE.tutorial;
