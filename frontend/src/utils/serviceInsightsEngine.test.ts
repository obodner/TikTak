import { describe, it, expect } from 'vitest';
import { generateServiceInsights } from './serviceInsightsEngine';

describe('serviceInsightsEngine', () => {
  it('detects slow first touch and generates warning', () => {
    const insights = generateServiceInsights({
      firstTouchAvgHours: 4.5,
      firstTouchCount: 5,
      noiseRatio: 10,
      duplicateCount: 1,
      outsideScopeCount: 0,
      irrelevantCount: 0,
      totalClosed: 10,
      hotspots: [],
      vendorScorecard: [],
      meTooTickets: []
    });

    const intakeInsight = insights.find(i => i.category === 'intake');
    expect(intakeInsight).toBeDefined();
    expect(intakeInsight?.type).toBe('warning');
    expect(intakeInsight?.title).toContain('מענה ראשוני');
  });

  it('detects chronic hotspots and suggests pinning a notice', () => {
    const insights = generateServiceInsights({
      firstTouchAvgHours: 1.2,
      firstTouchCount: 5,
      noiseRatio: 10,
      duplicateCount: 1,
      outsideScopeCount: 0,
      irrelevantCount: 0,
      totalClosed: 10,
      hotspots: [{ location: 'מעלית B', count: 4, topCategory: 'מעליות' }],
      vendorScorecard: [],
      meTooTickets: []
    });

    const hotspotInsight = insights.find(i => i.category === 'hotspots');
    expect(hotspotInsight).toBeDefined();
    expect(hotspotInsight?.actionType).toBe('pin_notice');
    expect(hotspotInsight?.actionPayload.location).toBe('מעלית B');
  });

  it('detects high noise ratio', () => {
    const insights = generateServiceInsights({
      firstTouchAvgHours: 1.0,
      firstTouchCount: 3,
      noiseRatio: 35,
      duplicateCount: 4,
      outsideScopeCount: 3,
      irrelevantCount: 0,
      totalClosed: 20,
      hotspots: [],
      vendorScorecard: [],
      meTooTickets: []
    });

    const noiseInsight = insights.find(i => i.category === 'noise');
    expect(noiseInsight).toBeDefined();
    expect(noiseInsight?.type).toBe('tip');
  });

  it('returns fallback healthy insight when data is quiet', () => {
    const insights = generateServiceInsights({
      firstTouchAvgHours: null,
      firstTouchCount: 0,
      noiseRatio: 0,
      duplicateCount: 0,
      outsideScopeCount: 0,
      irrelevantCount: 0,
      totalClosed: 0,
      hotspots: [],
      vendorScorecard: [],
      meTooTickets: []
    });

    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('general_best_practice');
  });
});
