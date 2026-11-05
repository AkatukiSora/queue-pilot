import type { AdminSlot } from './admin-api.ts';

/**
 * 機材の列は予約一覧 API の枠から導く (API の返却順の初出順)。
 * 1 列でも 5 列以上でも、設定された機材名だけが列になる。
 */
export function equipmentColumnsOf(
  slots: readonly Pick<AdminSlot, 'equipment'>[],
): string[] {
  return [...new Set(slots.map((slot) => slot.equipment))];
}
