import type { AiProfile, Biome, SettlementKind, StrategicTag, Vec2 } from '../types';

/** Formato bruto de `territories.json`. */
export interface TerritoryDef {
  id: string;
  name: string;
  seed: Vec2;
  weight: number;
  biome: Biome;
  /** Recursos naturais declarados; viram depósitos no mapa. */
  features: string[];
  tags: StrategicTag[];
  owner: string | null;
  settlement: {
    kind: SettlementKind;
    level: number;
    name: string;
    specialty?: 'iron' | 'trade' | 'holy' | 'mountain' | 'none';
  };
  population: number;
  defense: number;
  happiness: number;
  loyalty: number;
  stability: number;
  locked?: boolean;
  lockReason?: string;
  neighbors: string[];
}

/** Formato bruto de `kingdoms.json`. */
export interface KingdomDef {
  id: string;
  name: string;
  ownerKind: 'PLAYER' | 'AI';
  color: string;
  colorDark: string;
  emblem: 'fleur' | 'swords' | 'lion' | 'tree' | 'stag' | 'crown';
  capitalTerritoryId: string;
  aiProfile: AiProfile;
}
