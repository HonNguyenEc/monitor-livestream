import { isPlainObject } from '../../../common/utils/is-plain-object';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendBrand } from '../models/backend-brand.model';
import { BackendSchedule } from '../models/backend-schedule.model';
import { PlayUrlAnswer } from '../models/play-url-answer.model';
import { textOf } from './backend-values';

const MSG_BRANDS = 'Brands answer is not a list of objects';
const MSG_BRAND_ID = 'Brand without an id';
const MSG_BOARD = 'Board answer is not an object with a list of rows';
const MSG_PLAY_URL = 'play_url answer is not an object';

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** A brand id as text: ids are strings or integers, whichever the answer uses; anything else is ''. */
function idText(value: unknown): string {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
}

function brandId(value: unknown): string {
  const id = idText(value);
  if (!id) throw new BackendAnswerError(MSG_BRAND_ID);
  return id;
}

// Code-unit order, as Python compares the ISO strings.
export function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The brands connected to the Shopee Open API; other brands are not monitored. Throws BackendAnswerError. */
export function readBrands(answer: unknown): BackendBrand[] {
  if (!Array.isArray(answer) || !answer.every(isPlainObject)) {
    throw new BackendAnswerError(MSG_BRANDS);
  }
  return answer
    .filter((brand) => brand.is_connect_shopee === true)
    .map((brand) => {
      const id = brandId(brand.id);
      return { id, name: textOf(brand.name) || id };
    });
}

/** Board rows with a brand and a schedule id, grouped by brand id, each group sorted by `scheduled_at` as text (ISO strings). Throws BackendAnswerError. */
export function readBoard(answer: unknown): Map<string, BackendSchedule[]> {
  const items = isPlainObject(answer) ? (answer.items ?? []) : null;
  if (!Array.isArray(items) || !items.every(isPlainObject)) {
    throw new BackendAnswerError(MSG_BOARD);
  }
  const byBrand = new Map<string, BackendSchedule[]>();
  for (const item of items) {
    const row: BackendSchedule = {
      scheduleId: textOf(item.schedule_id),
      platform: nullableText(item.platform),
      sessionId: textOf(item.session_id),
      scheduledAt: nullableText(item.scheduled_at),
      expectedEndAt: nullableText(item.expected_end_at),
      status: nullableText(item.status),
      statusLabel: nullableText(item.status_label),
      scheduleStatus: nullableText(item.schedule_status),
    };
    const brand = idText(item.brand_id);
    if (!brand || !row.scheduleId) continue;
    byBrand.set(brand, [...(byBrand.get(brand) ?? []), row]);
  }
  for (const rows of byBrand.values()) {
    rows.sort((a, b) => compareText(a.scheduledAt ?? '', b.scheduledAt ?? ''));
  }
  return byBrand;
}

/** Throws BackendAnswerError. */
export function readPlayUrl(answer: unknown): PlayUrlAnswer {
  if (!isPlainObject(answer)) {
    throw new BackendAnswerError(MSG_PLAY_URL);
  }
  return {
    sessionId: textOf(answer.session_id),
    shopeeStatus: typeof answer.shopee_status === 'number' ? answer.shopee_status : null,
    isLive: answer.is_live === true,
    title: nullableText(answer.title),
    shareUrl: nullableText(answer.share_url),
    playUrl: textOf(answer.play_url),
    expiresAt: nullableText(answer.expires_at),
  };
}
