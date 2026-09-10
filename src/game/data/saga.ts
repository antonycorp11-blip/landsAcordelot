import sagaRaw from './saga.json';

/** Um capítulo de "O Acordo Quebrado". */
export interface SagaChapterDef {
  id: string;
  /** De quem é o pedaço da história; `null` no capítulo final. */
  kingdomId: string | null;
  order: number;
  chapter: string;
  title: string;
  /** Tomado à força. */
  conquest: string[];
  /** Contado por quem guardava. */
  friendship: string[];
  closing: string;
}

export const SAGA = sagaRaw as unknown as {
  title: string;
  chapters: SagaChapterDef[];
};

export const SAGA_CHAPTERS = [...SAGA.chapters].sort((a, b) => a.order - b.order);

export function sagaChapter(id: string): SagaChapterDef | null {
  return SAGA_CHAPTERS.find((c) => c.id === id) ?? null;
}
