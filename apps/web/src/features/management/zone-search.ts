import { isValidTimeZone } from './zoned-time.ts';

/** 日本語・英語の別名。IANA 名だけでは探しにくい代表的な地域だけを持つ。 */
const ALIASES: Record<string, string> = {
  'Asia/Tokyo': '日本 東京 JST japan tokyo',
  'Asia/Seoul': '韓国 ソウル KST korea seoul',
  'Asia/Shanghai': '中国 上海 北京 china beijing',
  'Asia/Taipei': '台湾 台北 taiwan',
  'Asia/Hong_Kong': '香港 hong kong',
  'Asia/Singapore': 'シンガポール singapore',
  'Asia/Bangkok': 'タイ バンコク thailand',
  'Asia/Kolkata': 'インド コルカタ india IST',
  'Asia/Dubai': 'ドバイ アラブ首長国連邦 uae',
  'Europe/London': 'イギリス ロンドン uk britain GMT BST',
  'Europe/Paris': 'フランス パリ france CET',
  'Europe/Berlin': 'ドイツ ベルリン germany CET',
  'America/New_York': 'ニューヨーク 米国東部 eastern EST EDT',
  'America/Chicago': 'シカゴ 米国中部 central CST CDT',
  'America/Denver': 'デンバー 米国山岳部 mountain MST MDT',
  'America/Los_Angeles': 'ロサンゼルス 米国太平洋 pacific PST PDT',
  'America/Honolulu': 'ハワイ ホノルル hawaii',
  'Australia/Sydney': 'オーストラリア シドニー australia AEST AEDT',
  'Pacific/Auckland': 'ニュージーランド オークランド new zealand NZST',
  UTC: '協定世界時 UTC GMT',
};

export type ZoneOption = { id: string; search: string };

/** 表示名 (日本語・英語の長い名称) を IANA 名に添えた検索用の文字列を作る。 */
function searchText(id: string): string {
  const names = ['ja-JP', 'en-US'].map(
    (locale) =>
      new Intl.DateTimeFormat(locale, { timeZone: id, timeZoneName: 'long' })
        .formatToParts(new Date(0))
        .find((part) => part.type === 'timeZoneName')?.value ?? '',
  );
  return [id, id.replaceAll('_', ' '), ...names, ALIASES[id] ?? '']
    .join(' ')
    .toLowerCase();
}

export function listTimeZones(): string[] {
  const names = Intl.supportedValuesOf('timeZone');
  return names.includes('UTC') ? names : ['UTC', ...names];
}

export function buildZoneIndex(ids: string[]): ZoneOption[] {
  return ids.map((id) => ({ id, search: searchText(id) }));
}

/** 空白区切りの語がすべて含まれるものを、IANA 名の前方一致を優先して返す。 */
export function filterZones(
  index: ZoneOption[],
  query: string,
  limit = 50,
): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits = index.filter((zone) =>
    terms.every((term) => zone.search.includes(term)),
  );
  const first = query.trim().toLowerCase();
  const rank = (zone: ZoneOption) =>
    zone.id.toLowerCase().startsWith(first) ? 0 : 1;
  return hits
    .map((zone, order) => ({ zone, order }))
    .sort((a, b) => rank(a.zone) - rank(b.zone) || a.order - b.order)
    .slice(0, limit)
    .map(({ zone }) => zone.id);
}

/** 入力が空のときに最初に示す候補。ブラウザの時刻帯を先頭にする。 */
export function initialZones(browserZone: string, all: string[]): string[] {
  const known = new Set(all);
  const browserZoneOption = isValidTimeZone(browserZone) ? [browserZone] : [];
  return [...new Set([...browserZoneOption, 'UTC', 'Asia/Tokyo'])].filter(
    (id) => id === browserZone || known.has(id),
  );
}
