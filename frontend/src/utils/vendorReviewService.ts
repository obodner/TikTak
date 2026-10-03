import { doc, getDoc, getDocs, collection, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { VendorRatingSummary, VendorReviewRecord, RfqRating } from '../types/rfq';
import { logAction } from './auditLogger';

/**
 * Pure calculation helper to derive summary stats from a list of reviews
 */
export function computeVendorRatingSummary(
  reviews: Array<{ stars: number; wouldRehire: boolean; tags?: string[]; ratedAt?: string }>
): VendorRatingSummary {
  if (!reviews || reviews.length === 0) {
    return {
      averageScore: 0,
      totalReviews: 0,
      rehireCount: 0,
      rehirePercentage: 0,
      topTags: [],
      lastRatedAt: new Date().toISOString()
    };
  }

  const totalReviews = reviews.length;
  const sumScores = reviews.reduce((sum, r) => sum + (Number(r.stars) || 0), 0);
  const averageScore = Math.round((sumScores / totalReviews) * 10) / 10;

  const rehireCount = reviews.filter(r => r.wouldRehire === true).length;
  const rehirePercentage = Math.round((rehireCount / totalReviews) * 100);

  // Frequency count for tags
  const tagCounts: Record<string, number> = {};
  reviews.forEach(r => {
    if (Array.isArray(r.tags)) {
      r.tags.forEach(t => {
        const cleanTag = t.trim();
        if (cleanTag) {
          tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
        }
      });
    }
  });

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(entry => entry[0]);

  // Find most recent ratedAt date
  const sortedDates = reviews
    .map(r => r.ratedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());

  const lastRatedAt = sortedDates[0] || new Date().toISOString();

  return {
    averageScore,
    totalReviews,
    rehireCount,
    rehirePercentage,
    topTags,
    lastRatedAt
  };
}

/**
 * Mark RFQ as completed in Firestore
 */
export async function markRfqCompleted({
  tenantId,
  rfqId,
  admin
}: {
  tenantId: string;
  rfqId: string;
  admin: { uid: string; name: string };
}) {
  const nowIso = new Date().toISOString();
  const rfqRef = doc(db, 'tenants', tenantId, 'rfqs', rfqId);

  await updateDoc(rfqRef, {
    status: 'completed',
    completedAt: nowIso,
    completedBy: admin,
    updatedAt: nowIso
  });

  await logAction({
    tenantId,
    action: 'CONFIGURATION_UPDATE',
    actor: { uid: admin.uid, name: admin.name, type: 'admin' },
    details: {
      rfqId,
      subAction: 'RFQ_COMPLETED',
      completedAt: nowIso
    }
  });

  return { completedAt: nowIso };
}

/**
 * Atomic save of vendor review:
 * 1. Updates RFQ rating
 * 2. Writes review to tenants/{tenantId}/vendors/{vendorId}/reviews/{rfqId}
 * 3. Re-calculates and updates Vendor's ratingSummary
 */
export async function saveVendorReview({
  tenantId,
  rfqId,
  rfqTitle,
  rfqCategory,
  awardedPrice,
  vendorId,
  rating,
  admin
}: {
  tenantId: string;
  rfqId: string;
  rfqTitle: string;
  rfqCategory?: string;
  awardedPrice?: number;
  vendorId: string;
  rating: {
    stars: number;
    wouldRehire: boolean;
    tags: string[];
    comment?: string;
  };
  admin: { uid: string; name: string };
}): Promise<RfqRating> {
  const nowIso = new Date().toISOString();
  let vendorTenantId = tenantId;
  try {
    const tSnap = await getDoc(doc(db, 'tenants', tenantId));
    if (tSnap.exists()) {
      const tData = tSnap.data();
      if (tData.usesParentPool && tData.parentEnterpriseId) {
        vendorTenantId = tData.parentEnterpriseId;
      }
    }
  } catch (tErr) {
    console.warn("Could not check tenant pool status for vendor review:", tErr);
  }

  const rfqRef = doc(db, 'tenants', tenantId, 'rfqs', rfqId);
  const vendorRef = doc(db, 'tenants', vendorTenantId, 'vendors', vendorId);
  const reviewRef = doc(db, 'tenants', vendorTenantId, 'vendors', vendorId, 'reviews', rfqId);

  // 1. Fetch existing reviews to recalculate accurate aggregates
  let existingReviews: VendorReviewRecord[] = [];
  try {
    const reviewsSnap = await getDocs(collection(db, 'tenants', vendorTenantId, 'vendors', vendorId, 'reviews'));
    existingReviews = reviewsSnap.docs
      .filter(d => d.id !== rfqId)
      .map(d => ({ id: d.id, ...d.data() } as VendorReviewRecord));
  } catch (err) {
    console.warn("Could not query previous vendor reviews:", err);
  }

  const cleanComment = (rating.comment || '').trim();

  const currentReview: VendorReviewRecord = {
    id: rfqId,
    rfqId,
    rfqTitle: rfqTitle || '',
    rfqCategory: rfqCategory || '',
    stars: rating.stars,
    wouldRehire: rating.wouldRehire,
    tags: Array.isArray(rating.tags) ? rating.tags : [],
    ratedAt: nowIso,
    ratedBy: admin
  };

  if (awardedPrice !== undefined && awardedPrice !== null) {
    currentReview.awardedPrice = Number(awardedPrice);
  }
  if (cleanComment) {
    currentReview.comment = cleanComment;
  }

  const allReviews = [...existingReviews, currentReview];
  const newRatingSummary = computeVendorRatingSummary(allReviews);

  const rfqRatingData: RfqRating = {
    stars: rating.stars,
    wouldRehire: rating.wouldRehire,
    tags: Array.isArray(rating.tags) ? rating.tags : [],
    ratedAt: nowIso,
    ratedBy: admin
  };
  if (cleanComment) {
    rfqRatingData.comment = cleanComment;
  }

  // Atomic batch write
  const batch = writeBatch(db);

  batch.update(rfqRef, {
    status: 'completed',
    rating: rfqRatingData,
    updatedAt: nowIso
  });

  batch.set(reviewRef, {
    ...currentReview,
    updatedAt: nowIso
  });

  batch.update(vendorRef, {
    ratingSummary: newRatingSummary,
    updatedAt: nowIso
  });

  await batch.commit();

  await logAction({
    tenantId,
    action: 'CONFIGURATION_UPDATE',
    actor: { uid: admin.uid, name: admin.name, type: 'admin' },
    details: {
      rfqId,
      vendorId,
      subAction: 'VENDOR_REVIEW_SAVED',
      stars: rating.stars,
      wouldRehire: rating.wouldRehire,
      averageScore: newRatingSummary.averageScore
    }
  });

  return rfqRatingData;
}
