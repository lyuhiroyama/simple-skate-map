const cache = new Map<string, { en: string | null; ja: string | null }>();

const JP_PREF: Record<string, string> = {
  'JP-01': '北海道',
  'JP-02': '青森県',
  'JP-03': '岩手県',
  'JP-04': '宮城県',
  'JP-05': '秋田県',
  'JP-06': '山形県',
  'JP-07': '福島県',
  'JP-08': '茨城県',
  'JP-09': '栃木県',
  'JP-10': '群馬県',
  'JP-11': '埼玉県',
  'JP-12': '千葉県',
  'JP-13': '東京都',
  'JP-14': '神奈川県',
  'JP-15': '新潟県',
  'JP-16': '富山県',
  'JP-17': '石川県',
  'JP-18': '福井県',
  'JP-19': '山梨県',
  'JP-20': '長野県',
  'JP-21': '岐阜県',
  'JP-22': '静岡県',
  'JP-23': '愛知県',
  'JP-24': '三重県',
  'JP-25': '滋賀県',
  'JP-26': '京都府',
  'JP-27': '大阪府',
  'JP-28': '兵庫県',
  'JP-29': '奈良県',
  'JP-30': '和歌山県',
  'JP-31': '鳥取県',
  'JP-32': '島根県',
  'JP-33': '岡山県',
  'JP-34': '広島県',
  'JP-35': '山口県',
  'JP-36': '徳島県',
  'JP-37': '香川県',
  'JP-38': '愛媛県',
  'JP-39': '高知県',
  'JP-40': '福岡県',
  'JP-41': '佐賀県',
  'JP-42': '長崎県',
  'JP-43': '熊本県',
  'JP-44': '大分県',
  'JP-45': '宮崎県',
  'JP-46': '鹿児島県',
  'JP-47': '沖縄県',
};

type NominatimPlace = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city?: string;
    town?: string;
    village?: string;
    city_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
    'ISO3166-2-lvl4'?: string;
  };
};

function keyFor(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function joinUnique(parts: Array<string | undefined>, sep: string) {
  const unique: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    if (unique.includes(value)) continue;
    if (unique.some((existing) => existing.includes(value) && existing !== value)) continue;
    unique.push(value);
  }
  return unique.join(sep);
}

function formatPlaceEn(place: NominatimPlace) {
  const a = place.address ?? {};
  const house = a.house_number?.trim();
  const road = a.road?.trim();
  const chome = a.neighbourhood?.trim() || a.suburb?.trim();
  let street = '';
  if (road) {
    street = [house, road].filter(Boolean).join(' ');
  } else if (chome && house) {
    street = `${chome}-${house}`;
  } else {
    street = chome || house || '';
  }
  return (
    joinUnique(
      [
        street,
        a.suburb,
        a.quarter,
        a.city || a.town || a.village || a.city_district,
        a.state,
        a.postcode,
        a.country,
      ],
      ', ',
    ) ||
    place.display_name?.trim() ||
    null
  );
}

function formatPlaceJa(place: NominatimPlace) {
  const a = place.address ?? {};
  const house = a.house_number?.trim();
  const road = a.road?.trim();
  const chome = a.neighbourhood?.trim();
  const ward = (a.city || a.town || a.village || a.city_district)?.trim();
  const prefecture = a.state?.trim() || JP_PREF[a['ISO3166-2-lvl4'] ?? ''];
  let block = '';
  if (chome && house) {
    block = `${chome}${house}番`;
  } else if (chome) {
    block = chome;
  } else if (road && house) {
    block = `${road}${house}`;
  } else {
    block = road || (house ? `${house}番` : '');
  }
  const suburb = a.suburb?.trim();
  const quarter = a.quarter?.trim();
  return (
    joinUnique(
      [
        a.country,
        prefecture,
        ward,
        suburb && suburb !== chome && suburb !== ward ? suburb : undefined,
        quarter && (!chome || !chome.includes(quarter)) ? quarter : undefined,
        block,
        road && chome ? road : undefined,
      ],
      ' ',
    ) ||
    place.display_name?.replace(/[,、]/g, ' ').replace(/\s+/g, ' ').trim() ||
    null
  );
}

async function nominatim(latitude: number, longitude: number, lang: 'en' | 'ja') {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(String(latitude))}` +
    `&lon=${encodeURIComponent(String(longitude))}` +
    `&accept-language=${lang}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': lang,
      'User-Agent': 'SimpleSkateMap/0.1 (beanface.studios@gmail.com)',
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as NominatimPlace;
  return lang === 'ja' ? formatPlaceJa(json) : formatPlaceEn(json);
}

export async function reverseGeocodeEnJa(latitude: number, longitude: number) {
  const key = keyFor(latitude, longitude);
  const cached = cache.get(key);
  if (cached) return cached;
  const [en, ja] = await Promise.all([
    nominatim(latitude, longitude, 'en').catch(() => null),
    nominatim(latitude, longitude, 'ja').catch(() => null),
  ]);
  const result = { en, ja };
  cache.set(key, result);
  return result;
}
