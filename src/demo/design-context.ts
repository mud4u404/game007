import type { DemoAction, DemoState, NpcDef, PlaceDef } from './model';

/** Shared game state, independent presentation. Designs never mutate the world. */
export interface WorldDesignContext {
  state: DemoState;
  place: PlaceDef;
  people: NpcDef[];
  selected: string;
  originName: string;
  notice: string;
  result: string;
  /** Place feedback beside the control that caused it, rather than jumping pages. */
  responseSection: 'scene' | 'people' | 'public-actions' | 'suggestions';
  legacy: string;
  theme: string;
  actionCard(action: DemoAction): string;
  relation(value: number): string;
}

export const escapeHTML = (value: unknown): string => String(value).replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
