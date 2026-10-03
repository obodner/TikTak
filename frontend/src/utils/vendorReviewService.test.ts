import { describe, it, expect } from 'vitest';
import { computeVendorRatingSummary } from './vendorReviewService';

describe('vendorReviewService - computeVendorRatingSummary', () => {
  it('returns empty defaults when reviews list is empty', () => {
    const summary = computeVendorRatingSummary([]);
    expect(summary.totalReviews).toBe(0);
    expect(summary.averageScore).toBe(0);
    expect(summary.rehireCount).toBe(0);
    expect(summary.rehirePercentage).toBe(0);
    expect(summary.topTags).toEqual([]);
  });

  it('calculates average score, rehire percentage, and top tags correctly', () => {
    const mockReviews = [
      {
        stars: 5,
        wouldRehire: true,
        tags: ['עמידה בזמנים', 'מקצועיות גבוהה'],
        ratedAt: '2026-10-01T10:00:00.000Z'
      },
      {
        stars: 4,
        wouldRehire: true,
        tags: ['עמידה בזמנים', 'מחיר הוגן'],
        ratedAt: '2026-10-02T12:00:00.000Z'
      },
      {
        stars: 3,
        wouldRehire: false,
        tags: ['איחור בביצוע'],
        ratedAt: '2026-10-03T09:00:00.000Z'
      }
    ];

    const summary = computeVendorRatingSummary(mockReviews);

    // Sum of stars: 5 + 4 + 3 = 12 / 3 = 4.0
    expect(summary.totalReviews).toBe(3);
    expect(summary.averageScore).toBe(4.0);

    // Rehire: 2 out of 3 = 67%
    expect(summary.rehireCount).toBe(2);
    expect(summary.rehirePercentage).toBe(67);

    // Top tags: 'עמידה בזמנים' appeared twice, others once
    expect(summary.topTags[0]).toBe('עמידה בזמנים');
    expect(summary.topTags.length).toBeLessThanOrEqual(3);

    // Last rated date should be the most recent
    expect(summary.lastRatedAt).toBe('2026-10-03T09:00:00.000Z');
  });

  it('properly rounds decimals for average score', () => {
    const mockReviews = [
      { stars: 5, wouldRehire: true },
      { stars: 4, wouldRehire: true },
      { stars: 5, wouldRehire: true }
    ]; // 14 / 3 = 4.6666... -> rounds to 4.7

    const summary = computeVendorRatingSummary(mockReviews);
    expect(summary.averageScore).toBe(4.7);
    expect(summary.rehirePercentage).toBe(100);
  });

  it('handles reviews with empty or undefined tags gracefully', () => {
    const mockReviews = [
      { stars: 5, wouldRehire: true, tags: undefined },
      { stars: 4, wouldRehire: true, tags: [] }
    ];

    const summary = computeVendorRatingSummary(mockReviews as any);
    expect(summary.totalReviews).toBe(2);
    expect(summary.averageScore).toBe(4.5);
    expect(summary.topTags).toEqual([]);
  });
});
