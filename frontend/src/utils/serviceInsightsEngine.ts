export interface ServiceInsightInput {
  firstTouchAvgHours: number | null;
  firstTouchCount: number;
  noiseRatio: number; // 0 - 100
  duplicateCount: number;
  outsideScopeCount: number;
  irrelevantCount: number;
  totalClosed: number;
  hotspots: Array<{ location: string; count: number; topCategory?: string }>;
  vendorScorecard: Array<{
    name: string;
    avgAckMinutes: number | null;
    avgExecutionHours: number | null;
    dispatches: number;
    completedCount: number;
  }>;
  meTooTickets: Array<{ id: string; summary: string; location?: string; meToo?: number }>;
  intakeExecutionSplit?: { intakeHours: number; executionHours: number; intakePercent: number };
  isEn?: boolean;
}

export interface ServiceInsight {
  id: string;
  category: 'intake' | 'hotspots' | 'noise' | 'vendor' | 'community';
  type: 'tip' | 'warning' | 'success';
  title: string;
  description: string;
  recommendation: string;
  actionType?: 'pin_notice' | 'filter_ticket' | 'none';
  actionPayload?: any;
}

export function generateServiceInsights(input: ServiceInsightInput): ServiceInsight[] {
  const {
    firstTouchAvgHours,
    firstTouchCount,
    noiseRatio,
    outsideScopeCount,
    totalClosed,
    hotspots,
    vendorScorecard,
    meTooTickets,
    intakeExecutionSplit,
    isEn = false
  } = input;

  const insights: ServiceInsight[] = [];

  // 1. First-Touch & Intake Insights
  if (firstTouchAvgHours !== null && firstTouchCount > 0) {
    if (firstTouchAvgHours > 2) {
      insights.push({
        id: 'intake_high_first_touch',
        category: 'intake',
        type: 'warning',
        title: isEn ? 'Reduce Initial Response Time' : 'קיצור זמן מענה ראשוני לדיירים',
        description: isEn
          ? `Average first-touch response is ${firstTouchAvgHours.toFixed(1)} hours (benchmark target: under 2 hours).`
          : `זמן המענה הראשוני הממוצע עומד על ${firstTouchAvgHours.toFixed(1)} שעות (יעד המערכת: מתחת לשעתיים).`,
        recommendation: isEn
          ? 'Assign a daily committee volunteer on morning intake duty. Quick initial acknowledgement reduces resident frustration even before work begins.'
          : 'מומלץ לקבוע תורן יומי בוועד לקליטת פניות בוקר. מתן מענה ואישור קבלה מהיר לדייר מפיג תסכול ומוריד פניות חוזרות.',
        actionType: 'none'
      });
    } else {
      insights.push({
        id: 'intake_fast_first_touch',
        category: 'intake',
        type: 'success',
        title: isEn ? 'Excellent Initial Response Speed' : 'מענה ראשוני מהיר ומצטיין',
        description: isEn
          ? `Average first response is ${firstTouchAvgHours < 1 ? Math.round(firstTouchAvgHours * 60) + ' minutes' : firstTouchAvgHours.toFixed(1) + ' hours'}.`
          : `זמן המענה הראשוני עומד על ${firstTouchAvgHours < 1 ? Math.round(firstTouchAvgHours * 60) + ' דקות' : firstTouchAvgHours.toFixed(1) + ' שעות'}.`,
        recommendation: isEn
          ? 'Great job! Fast acknowledgement directly enhances resident trust in the building committee.'
          : 'כל הכבוד! מענה מיידי לדייר מייצר אמון גבוה בוועד הבית ומונע פתיחת קבוצות וואטסאפ רועשות.',
        actionType: 'none'
      });
    }
  }

  // 2. Time-in-State Intake vs Execution Bottleneck
  if (intakeExecutionSplit && intakeExecutionSplit.intakePercent > 45) {
    insights.push({
      id: 'intake_bottleneck',
      category: 'intake',
      type: 'tip',
      title: isEn ? 'Administrative Intake Bottleneck' : 'צוואר בקבוק בשלב הקליטה והמיון',
      description: isEn
        ? `${intakeExecutionSplit.intakePercent}% of total resolution time is spent in administrative triage before vendor dispatch.`
        : `${intakeExecutionSplit.intakePercent}% מסך זמן הטיפול מוקדש לשלב הקליטה והמיון בוועד לפני העברה לספק.`,
      recommendation: isEn
        ? 'Enable QuickTap shortcuts and direct vendor routing to cut triage time in half.'
        : 'שימוש בכפתור "העבר לספק בוואטסאפ" ישירות מהכרטיס יקצר את זמן ההמתנה הראשוני ביותר מ-50%.',
      actionType: 'none'
    });
  }

  // 3. Chronic Hotspots & Preventative Maintenance
  if (hotspots && hotspots.length > 0 && hotspots[0].count >= 3) {
    const top = hotspots[0];
    insights.push({
      id: 'hotspot_chronic_failure',
      category: 'hotspots',
      type: 'warning',
      title: isEn ? `Recurring Failures at ${top.location}` : `מוקד כשל חוזר: ${top.location}`,
      description: isEn
        ? `${top.count} separate reports recorded for this location${top.topCategory ? ` (primarily ${top.topCategory})` : ''}.`
        : `נרשמו ${top.count} דיווחים נפרדים במוקד זה${top.topCategory ? ` (בעיקר בתחום ${top.topCategory})` : ''}.`,
      recommendation: isEn
        ? 'Order an in-depth contractor audit rather than repeated quick fixes. Pin an in-app notice to prevent duplicate resident reports.'
        : 'במקום לשלם על קריאות שירות נקודתיות חוזרות, הזמינו בדיקה מקיפה מהספק והציבו באנר עדכון לדיירים למניעת כפילויות.',
      actionType: 'pin_notice',
      actionPayload: { location: top.location, category: top.topCategory }
    });
  }

  // 4. Noise & Scope Optimization
  if (totalClosed > 0 && (noiseRatio >= 20 || outsideScopeCount >= 2)) {
    insights.push({
      id: 'noise_reduction_tip',
      category: 'noise',
      type: 'tip',
      title: isEn ? 'Deter Non-Relevant Reports' : 'הפחתת דיווחי סרק ומחוץ לאחריות',
      description: isEn
        ? `${noiseRatio}% of tickets are duplicates, municipal scope, or irrelevant.`
        : `${noiseRatio}% מהפניות הסגורות הן כפילויות, מחוץ לאחריות ועד או לא רלוונטיות.`,
      recommendation: isEn
        ? 'Place a pinned notice at the top of the reporting form directing municipal issues to the 106 city hotline.'
        : 'הציבו באנר הודעות בדף הדיווח שמפנה מפגעי רחוב/עירייה למוקד 106. פעולה זו חוסכת עד 30% מעומס הטיפול של הוועד.',
      actionType: 'pin_notice',
      actionPayload: { location: '', category: '' }
    });
  }

  // 5. Vendor Performance & Accountability
  const slowVendor = vendorScorecard.find(
    v => v.dispatches >= 2 && v.avgAckMinutes !== null && v.avgAckMinutes > 720 // > 12 hours
  );
  if (slowVendor) {
    const hours = Math.round((slowVendor.avgAckMinutes || 0) / 60);
    insights.push({
      id: 'vendor_slow_ack',
      category: 'vendor',
      type: 'warning',
      title: isEn ? `Vendor SLA Warning: ${slowVendor.name}` : `עיכוב מענה לספק: ${slowVendor.name}`,
      description: isEn
        ? `Vendor takes an average of ${hours} hours to acknowledge dispatch notifications.`
        : `הספק ממתין בממוצע ${hours} שעות עד לאישור קבלת הקריאה בוואטסאפ.`,
      recommendation: isEn
        ? 'Anchor a clear response SLA (e.g. within 2-4 hours) upon annual maintenance contract renewal.'
        : 'הגדירו בחידוש החוזה השנתי סעיף SLA ברור למענה תוך 2-4 שעות, או הוסיפו ספק גיבוי באותה קטגוריה.',
      actionType: 'none'
    });
  }

  // 6. Community Demand & Transparency (Me Too 📢)
  if (meTooTickets && meTooTickets.length > 0 && (meTooTickets[0].meToo || 0) >= 2) {
    const topVoted = meTooTickets[0];
    insights.push({
      id: 'community_upvotes_focus',
      category: 'community',
      type: 'tip',
      title: isEn ? 'High Community Demand Ticket' : 'פנייה בעלת ביקוש קהילתי גבוה',
      description: isEn
        ? `"${topVoted.summary}" has ${topVoted.meToo} resident upvotes (Me Too 📢).`
        : `הפנייה "${topVoted.summary}" צברה ${topVoted.meToo} הצבעות דיירים ("גם אצלי" 📢).`,
      recommendation: isEn
        ? 'Prioritize this issue and post transparent status updates. Resolving widely-supported issues maximizes resident satisfaction.'
        : 'טפלו בפנייה זו בעדיפות ועדכנו סטטוס באופן שקוף. סגירת תקלה עם עניין קהילתי רחב מניבה את שביעות הרצון הגבוהה ביותר.',
      actionType: 'filter_ticket',
      actionPayload: { ticketId: topVoted.id }
    });
  }

  // Fallback tip if everything is quiet and low volume
  if (insights.length === 0) {
    insights.push({
      id: 'general_best_practice',
      category: 'community',
      type: 'success',
      title: isEn ? 'Operational Health is Stable' : 'המצב התפעולי בבניין יציב ותקין',
      description: isEn
        ? 'No critical bottlenecks or high noise rates detected for the selected period.'
        : 'לא זוהו צווארי בקבוק חריגים או שיעור רעש גבוה בתקופה שנבחרה.',
      recommendation: isEn
        ? 'Continue conducting periodic walkthroughs and encourage residents to use QR Snap & Send for any minor defects.'
        : 'המשיכו בסיורים תקופתיים ועודדו דיירים לדווח בסריקת ה-QR גם על תקלות קטנות לפני שהן הופכות למפגע כבד.',
      actionType: 'none'
    });
  }

  return insights;
}
