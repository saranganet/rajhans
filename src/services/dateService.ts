import type { SettlementPeriodInfo } from '../types';

export const TIMEZONE_KOLKATA = 'Asia/Kolkata';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/**
 * Returns whether a given calendar year is a leap year.
 * Rule: Divisible by 4, except end of century years unless divisible by 400.
 */
export function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

/**
 * Returns the exact number of days in a given month of a year.
 * @param year e.g. 2026
 * @param month 1 to 12 (1 = Jan, 2 = Feb, etc.)
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
  }

  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/**
 * Converts a JS Date or ISO timestamp into a YYYY-MM-DD string in Asia/Kolkata timezone.
 */
export function toKolkataDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  return formatter.format(date); // outputs YYYY-MM-DD
}

/**
 * Returns current timestamp formatted as ISO with Asia/Kolkata context.
 */
export function getNowKolkataISO(): string {
  return new Date().toISOString();
}

/**
 * Returns today's business date in YYYY-MM-DD (Asia/Kolkata).
 */
export function getTodayKolkata(): string {
  return toKolkataDateString(new Date());
}

/**
 * Parses a YYYY-MM-DD string into components { year, month, day }.
 */
export function parseDateComponents(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date string format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid numeric components in date string: "${dateStr}"`);
  }

  return { year, month, day };
}

/**
 * Formats components back into YYYY-MM-DD padded with zeroes.
 */
export function formatDateStr(year: number, month: number, day: number): string {
  const mm = month < 10 ? `0${month}` : `${month}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Returns formatted details for display e.g.:
 * "30 August 2026", "Sunday"
 */
export function getFormattedDateDetails(dateStr: string): {
  dateStr: string;
  year: number;
  month: number;
  day: number;
  dayName: string;
  monthName: string;
  formattedDate: string;
  isToday: boolean;
} {
  const { year, month, day } = parseDateComponents(dateStr);
  const monthName = MONTH_NAMES[month - 1];
  
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayName = DAY_NAMES[utcDate.getUTCDay()];
  
  const formattedDate = `${day} ${monthName} ${year}`;
  const todayStr = getTodayKolkata();

  return {
    dateStr,
    year,
    month,
    day,
    dayName,
    monthName,
    formattedDate,
    isToday: dateStr === todayStr
  };
}

/**
 * Navigates forward or backward by `offsetDays` in a safe, calendar-accurate way.
 */
export function navigateDate(dateStr: string, offsetDays: number): string {
  const { year, month, day } = parseDateComponents(dateStr);
  const targetDate = new Date(Date.UTC(year, month - 1, day + offsetDays));
  
  const targetYear = targetDate.getUTCFullYear();
  const targetMonth = targetDate.getUTCMonth() + 1;
  const targetDay = targetDate.getUTCDate();
  
  return formatDateStr(targetYear, targetMonth, targetDay);
}

/**
 * Computes the three strict 10-day settlement periods for a given year & month.
 */
export function getSettlementPeriods(year: number, month: number): SettlementPeriodInfo[] {
  const totalDays = getDaysInMonth(year, month);
  const monthName = MONTH_NAMES[month - 1];

  const p1: SettlementPeriodInfo = {
    year,
    month,
    period_index: 1,
    period_start: formatDateStr(year, month, 1),
    period_end: formatDateStr(year, month, 10),
    month_name: monthName,
    total_days_in_month: totalDays,
    label: `1–10 ${monthName} ${year}`
  };

  const p2: SettlementPeriodInfo = {
    year,
    month,
    period_index: 2,
    period_start: formatDateStr(year, month, 11),
    period_end: formatDateStr(year, month, 20),
    month_name: monthName,
    total_days_in_month: totalDays,
    label: `11–20 ${monthName} ${year}`
  };

  const p3: SettlementPeriodInfo = {
    year,
    month,
    period_index: 3,
    period_start: formatDateStr(year, month, 21),
    period_end: formatDateStr(year, month, totalDays),
    month_name: monthName,
    total_days_in_month: totalDays,
    label: `21–${totalDays} ${monthName} ${year}`
  };

  return [p1, p2, p3];
}

/**
 * Determines which 10-day settlement period contains the given date.
 */
export function getPeriodForDate(dateStr: string): SettlementPeriodInfo {
  const { year, month, day } = parseDateComponents(dateStr);
  const periods = getSettlementPeriods(year, month);

  if (day <= 10) return periods[0];
  if (day <= 20) return periods[1];
  return periods[2];
}

/**
 * Returns all months in a given year for selection dropdowns.
 */
export function getMonthsForYear(year: number): { month: number; name: string; days: number }[] {
  return MONTH_NAMES.map((name, index) => ({
    month: index + 1,
    name,
    days: getDaysInMonth(year, index + 1)
  }));
}
