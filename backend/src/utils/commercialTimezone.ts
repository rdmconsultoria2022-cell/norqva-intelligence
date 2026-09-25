/**
 * NORQVA — Canonical Commercial Timezone & Time Window Utilities
 * Enforces strict temporal boundaries based on COMMERCIAL_TIMEZONE (America/Sao_Paulo).
 */

export const COMMERCIAL_TIMEZONE = process.env.COMMERCIAL_TIMEZONE || 'America/Sao_Paulo';

export type AttributionPeriod = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom' | 'all';

export interface CommercialTimeBoundaries {
  period: AttributionPeriod;
  timeZone: string;
  startDate: Date;
  endDate: Date;
  startDateIso: string;
  endDateIso: string;
  dateStartMeta: string; // YYYY-MM-DD in commercial timezone
  dateStopMeta: string;  // YYYY-MM-DD in commercial timezone
  sameDateWindowEnforced: boolean;
}

/**
 * Gets the offset in minutes for a given UTC Date when evaluated in the target timezone.
 */
export function getTimezoneOffsetMinutes(date: Date, timeZone: string = COMMERCIAL_TIMEZONE): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  parts.forEach(p => { map[p.type] = p.value; });

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1;
  const day = parseInt(map.day, 10);
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const localDateUtc = Date.UTC(year, month, day, hour, minute, second);
  return Math.round((localDateUtc - date.getTime()) / 60000);
}

/**
 * Creates an exact UTC Date corresponding to a local timestamp components in target timezone.
 */
export function createDateInTimezone(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string = COMMERCIAL_TIMEZONE
): Date {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const offsetMinutes = getTimezoneOffsetMinutes(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offsetMinutes * 60000);
}

/**
 * Extracts local Date components (year, month, day) in commercial timezone.
 */
export function getLocalComponentsInTimezone(date: Date, timeZone: string = COMMERCIAL_TIMEZONE): {
  year: number;
  month: number;
  day: number;
  dateStr: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  parts.forEach(p => { map[p.type] = p.value; });

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const dateStr = `${year}-${monthStr}-${dayStr}`;

  return { year, month, day, dateStr };
}

/**
 * Parses and computes canonical commercial time boundaries strictly aligned with America/Sao_Paulo.
 */
export function getCommercialTimeBoundaries(
  periodParam?: string,
  startDateParam?: string,
  endDateParam?: string,
  baseDate: Date = new Date(),
  timeZone: string = COMMERCIAL_TIMEZONE
): CommercialTimeBoundaries {
  let period: AttributionPeriod = '30d';
  const requestedPeriod = (periodParam || '30d').toLowerCase();

  const currentLocal = getLocalComponentsInTimezone(baseDate, timeZone);

  let startDate: Date;
  let endDate: Date;
  let dateStartMeta: string;
  let dateStopMeta: string;

  if (requestedPeriod === 'today') {
    period = 'today';
    startDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 0, 0, 0, 0, timeZone);
    endDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 23, 59, 59, 999, timeZone);
    dateStartMeta = currentLocal.dateStr;
    dateStopMeta = currentLocal.dateStr;
  } else if (requestedPeriod === 'yesterday') {
    period = 'yesterday';
    const startBase = new Date(baseDate.getTime() - 24 * 3600 * 1000);
    const yesterdayLocal = getLocalComponentsInTimezone(startBase, timeZone);
    startDate = createDateInTimezone(yesterdayLocal.year, yesterdayLocal.month, yesterdayLocal.day, 0, 0, 0, 0, timeZone);
    endDate = createDateInTimezone(yesterdayLocal.year, yesterdayLocal.month, yesterdayLocal.day, 23, 59, 59, 999, timeZone);
    dateStartMeta = yesterdayLocal.dateStr;
    dateStopMeta = yesterdayLocal.dateStr;
  } else if (requestedPeriod === '7d') {
    period = '7d';
    const startBase = new Date(baseDate.getTime() - 6 * 24 * 3600 * 1000);
    const startLocal = getLocalComponentsInTimezone(startBase, timeZone);
    startDate = createDateInTimezone(startLocal.year, startLocal.month, startLocal.day, 0, 0, 0, 0, timeZone);
    endDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 23, 59, 59, 999, timeZone);
    dateStartMeta = startLocal.dateStr;
    dateStopMeta = currentLocal.dateStr;
  } else if (requestedPeriod === '90d') {
    period = '90d';
    const startBase = new Date(baseDate.getTime() - 89 * 24 * 3600 * 1000);
    const startLocal = getLocalComponentsInTimezone(startBase, timeZone);
    startDate = createDateInTimezone(startLocal.year, startLocal.month, startLocal.day, 0, 0, 0, 0, timeZone);
    endDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 23, 59, 59, 999, timeZone);
    dateStartMeta = startLocal.dateStr;
    dateStopMeta = currentLocal.dateStr;
  } else if (requestedPeriod === 'custom' && startDateParam && endDateParam) {
    period = 'custom';
    const parsedStart = new Date(startDateParam);
    const parsedEnd = new Date(endDateParam);
    if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime()) && parsedStart <= parsedEnd) {
      if (startDateParam.includes('T') && endDateParam.includes('T')) {
        startDate = parsedStart;
        endDate = parsedEnd;
        dateStartMeta = getLocalComponentsInTimezone(startDate, timeZone).dateStr;
        dateStopMeta = getLocalComponentsInTimezone(endDate, timeZone).dateStr;
      } else {
        const startLocal = getLocalComponentsInTimezone(parsedStart, timeZone);
        const endLocal = getLocalComponentsInTimezone(parsedEnd, timeZone);
        startDate = createDateInTimezone(startLocal.year, startLocal.month, startLocal.day, 0, 0, 0, 0, timeZone);
        endDate = createDateInTimezone(endLocal.year, endLocal.month, endLocal.day, 23, 59, 59, 999, timeZone);
        dateStartMeta = startLocal.dateStr;
        dateStopMeta = endLocal.dateStr;
      }
    } else {
      // Fallback to 30d
      period = '30d';
      const startBase = new Date(baseDate.getTime() - 29 * 24 * 3600 * 1000);
      const startLocal = getLocalComponentsInTimezone(startBase, timeZone);
      startDate = createDateInTimezone(startLocal.year, startLocal.month, startLocal.day, 0, 0, 0, 0, timeZone);
      endDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 23, 59, 59, 999, timeZone);
      dateStartMeta = startLocal.dateStr;
      dateStopMeta = currentLocal.dateStr;
    }
  } else {
    // Default 30d
    period = '30d';
    const startBase = new Date(baseDate.getTime() - 29 * 24 * 3600 * 1000);
    const startLocal = getLocalComponentsInTimezone(startBase, timeZone);
    startDate = createDateInTimezone(startLocal.year, startLocal.month, startLocal.day, 0, 0, 0, 0, timeZone);
    endDate = createDateInTimezone(currentLocal.year, currentLocal.month, currentLocal.day, 23, 59, 59, 999, timeZone);
    dateStartMeta = startLocal.dateStr;
    dateStopMeta = currentLocal.dateStr;
  }

  return {
    period,
    timeZone,
    startDate,
    endDate,
    startDateIso: startDate.toISOString(),
    endDateIso: endDate.toISOString(),
    dateStartMeta,
    dateStopMeta,
    sameDateWindowEnforced: true
  };
}
