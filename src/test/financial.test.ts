import { describe, it, expect } from 'vitest';
import { calculateAmount, formatRupees, formatLitres, parseQuantityInput } from '../services/formatters';

describe('Financial & Currency Calculations', () => {
  it('correctly calculates amount avoiding floating-point precision errors', () => {
    // Example from prompt: 15 L @ ₹52/L = ₹780
    expect(calculateAmount(15, 52)).toBe(780);

    // Decimals test
    expect(calculateAmount(8.5, 52.5)).toBe(446.25);
    expect(calculateAmount(10.75, 54.25)).toBe(583.19); // 10.75 * 54.25 = 583.1875 -> 583.19 paisa rounded
    expect(calculateAmount(1.33, 50)).toBe(66.5);
    expect(calculateAmount(0.1, 52)).toBe(5.2);
    expect(calculateAmount(0.2, 52)).toBe(10.4);
    // 0.1 + 0.2 float error prevention
    expect(calculateAmount(0.3, 52)).toBe(15.6);
  });

  it('safely handles zero and invalid quantities', () => {
    expect(calculateAmount(0, 52)).toBe(0);
    expect(calculateAmount(-5, 52)).toBe(0);
    expect(calculateAmount(10, -52)).toBe(0);
    expect(calculateAmount(NaN, 52)).toBe(0);
  });

  it('formats rupees with standard Indian numbering system', () => {
    expect(formatRupees(52)).toBe('₹52');
    expect(formatRupees(7124)).toBe('₹7,124');
    expect(formatRupees(124850)).toBe('₹1,24,850');
    expect(formatRupees(1248500)).toBe('₹12,48,500');
    expect(formatRupees(7124.5)).toBe('₹7,124.50');
    expect(formatRupees(0)).toBe('₹0');
  });

  it('formats milk quantities correctly', () => {
    expect(formatLitres(8)).toBe('8 L');
    expect(formatLitres(8.5)).toBe('8.5 L');
    expect(formatLitres(10.75)).toBe('10.75 L');
    expect(formatLitres(0)).toBe('0 L');
  });

  it('parses quantity inputs properly', () => {
    expect(parseQuantityInput('8')).toBe(8);
    expect(parseQuantityInput('8.5')).toBe(8.5);
    expect(parseQuantityInput('  10.25  ')).toBe(10.25);
    expect(parseQuantityInput('')).toBe(0);
    expect(parseQuantityInput('abc')).toBe(0);
    expect(parseQuantityInput(-5)).toBe(0);
  });
});
