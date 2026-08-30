import { describe, it, expect } from 'vitest';
import {
  isLeapYear,
  getDaysInMonth,
  getSettlementPeriods,
  getPeriodForDate,
  navigateDate
} from '../services/dateService';

describe('DateService - Leap Year and Days in Month Calculations', () => {
  it('correctly identifies leap years and regular years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2400)).toBe(true);

    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2100)).toBe(false); // Century year not divisible by 400
    expect(isLeapYear(1900)).toBe(false);
  });

  it('correctly returns 28 days for Feb in non-leap years and 29 days in leap years', () => {
    expect(getDaysInMonth(2026, 2)).toBe(28);
    expect(getDaysInMonth(2025, 2)).toBe(28);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2028, 2)).toBe(29);
  });

  it('correctly returns 30 days for 30-day months', () => {
    expect(getDaysInMonth(2026, 4)).toBe(30); // April
    expect(getDaysInMonth(2026, 6)).toBe(30); // June
    expect(getDaysInMonth(2026, 9)).toBe(30); // September
    expect(getDaysInMonth(2026, 11)).toBe(30); // November
  });

  it('correctly returns 31 days for 31-day months', () => {
    expect(getDaysInMonth(2026, 1)).toBe(31); // January
    expect(getDaysInMonth(2026, 3)).toBe(31); // March
    expect(getDaysInMonth(2026, 5)).toBe(31); // May
    expect(getDaysInMonth(2026, 7)).toBe(31); // July
    expect(getDaysInMonth(2026, 8)).toBe(31); // August
    expect(getDaysInMonth(2026, 10)).toBe(31); // October
    expect(getDaysInMonth(2026, 12)).toBe(31); // December
  });
});

describe('DateService - Strict 10-Day Settlement Period Calculations', () => {
  it('correctly divides 31-day August 2026 into 3 settlement periods', () => {
    const periods = getSettlementPeriods(2026, 8);
    expect(periods).toHaveLength(3);

    // Period 1: 1st to 10th
    expect(periods[0].period_start).toBe('2026-08-01');
    expect(periods[0].period_end).toBe('2026-08-10');
    expect(periods[0].label).toBe('1–10 August 2026');

    // Period 2: 11th to 20th
    expect(periods[1].period_start).toBe('2026-08-11');
    expect(periods[1].period_end).toBe('2026-08-20');
    expect(periods[1].label).toBe('11–20 August 2026');

    // Period 3: 21st to 31st
    expect(periods[2].period_start).toBe('2026-08-21');
    expect(periods[2].period_end).toBe('2026-08-31');
    expect(periods[2].label).toBe('21–31 August 2026');
  });

  it('correctly divides 28-day February 2026 into 3 settlement periods', () => {
    const periods = getSettlementPeriods(2026, 2);
    expect(periods[0].period_start).toBe('2026-02-01');
    expect(periods[0].period_end).toBe('2026-02-10');

    expect(periods[1].period_start).toBe('2026-02-11');
    expect(periods[1].period_end).toBe('2026-02-20');

    expect(periods[2].period_start).toBe('2026-02-21');
    expect(periods[2].period_end).toBe('2026-02-28');
    expect(periods[2].label).toBe('21–28 February 2026');
  });

  it('correctly divides 29-day February 2024 (Leap Year) into 3 settlement periods', () => {
    const periods = getSettlementPeriods(2024, 2);
    expect(periods[2].period_start).toBe('2024-02-21');
    expect(periods[2].period_end).toBe('2024-02-29');
    expect(periods[2].label).toBe('21–29 February 2024');
  });

  it('correctly divides 30-day September 2026 into 3 settlement periods', () => {
    const periods = getSettlementPeriods(2026, 9);
    expect(periods[2].period_start).toBe('2026-09-21');
    expect(periods[2].period_end).toBe('2026-09-30');
    expect(periods[2].label).toBe('21–30 September 2026');
  });

  it('maps any date to its correct 10-day settlement period', () => {
    expect(getPeriodForDate('2026-08-05').period_index).toBe(1);
    expect(getPeriodForDate('2026-08-10').period_index).toBe(1);
    expect(getPeriodForDate('2026-08-11').period_index).toBe(2);
    expect(getPeriodForDate('2026-08-20').period_index).toBe(2);
    expect(getPeriodForDate('2026-08-21').period_index).toBe(3);
    expect(getPeriodForDate('2026-08-31').period_index).toBe(3);
    expect(getPeriodForDate('2026-02-28').period_index).toBe(3);
  });
});

describe('DateService - Date Navigation and Boundary Transitions', () => {
  it('correctly navigates across month boundaries', () => {
    // 31 Aug -> 1 Sep
    expect(navigateDate('2026-08-31', 1)).toBe('2026-09-01');
    // 1 Sep -> 31 Aug
    expect(navigateDate('2026-09-01', -1)).toBe('2026-08-31');

    // 28 Feb 2026 -> 1 Mar 2026
    expect(navigateDate('2026-02-28', 1)).toBe('2026-03-01');

    // 28 Feb 2024 (Leap Year) -> 29 Feb 2024 -> 1 Mar 2024
    expect(navigateDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(navigateDate('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('correctly navigates across year boundaries', () => {
    // 31 Dec 2026 -> 1 Jan 2027
    expect(navigateDate('2026-12-31', 1)).toBe('2027-01-01');
    // 1 Jan 2027 -> 31 Dec 2026
    expect(navigateDate('2027-01-01', -1)).toBe('2026-12-31');
  });
});
