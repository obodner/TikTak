export type VendorType = 'retainer' | 'occasional';

export interface VendorRatingSummary {
  averageScore: number;     // 1.0 - 5.0
  totalReviews: number;     // Count of reviews
  rehireCount: number;      // Count of wouldRehire = true
  rehirePercentage: number; // 0 - 100%
  topTags: string[];        // Top frequent tags
  lastRatedAt: string;      // ISO String
}

export interface Vendor {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  profession?: string; // legacy support
  companyId?: string; // ח.פ. / ת.ז.
  categories: string[];
  vendorType: VendorType;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  ratingSummary?: VendorRatingSummary;
}

export type RfqStatus = 'draft' | 'open' | 'awarded' | 'completed' | 'expired' | 'cancelled';

export interface RfqRating {
  stars: number; // 1 to 5
  wouldRehire: boolean;
  tags: string[];
  comment?: string;
  ratedAt: string; // ISO String
  ratedBy: {
    uid: string;
    name: string;
  };
}

export interface DispatchedVendorRecord {
  vendorId: string;
  vendorName: string;
  phone: string;
  vendorType: VendorType;
  companyId?: string; // ח.פ. / ת.ז.
  sentAt: string;
  tokenHash?: string;
  viewedAt?: string;
}

export interface RfqAttachment {
  name: string;
  url: string;
  sizeBytes?: number;
  mimeType?: string;
}

export interface PaymentPhaseItem {
  stageName: string;
  description?: string;
  percentage: number;
}

export interface PaymentTermsConfig {
  mode: 'single' | 'milestones';
  singleTermText?: string;
  phases?: PaymentPhaseItem[];
}

export interface ContractCustomizationData {
  scopeText?: string;
  workStartDate?: string;
  workEndDate?: string;
  customClauses?: Array<{ id: string; title: string; content: string }>;
  paymentMode?: 'milestones' | 'single';
  singlePaymentTerm?: string;
  milestones?: any[];
  wasteClauseText?: string;
  updatedAt?: string;
}

export interface WorkQuoteRequest {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
  ticketId?: string;
  ticketNumber?: number;
  
  title: string;
  category: string;
  description: string;
  location?: string;
  
  // Media references from ticket / admin
  imageId?: string;
  audioId?: string;
  attachments?: RfqAttachment[];
  
  // Payment terms, waste clause & working conditions
  paymentTerms?: PaymentTermsConfig;
  wasteClause?: string;
  allowedWorkHours?: string;
  workStartDate?: string;
  workTargetEndDate?: string;
  contractCustomizations?: ContractCustomizationData;
  
  // Recipient selection
  targetCategory: string;
  targetVendorType?: 'all' | 'retainer' | 'occasional';
  dispatchedVendors: DispatchedVendorRecord[];
  
  deadlineAt: string;
  status: RfqStatus;
  
  // Winner award metadata
  awardedQuoteId?: string;
  awardedVendorId?: string;
  awardedVendorName?: string;
  awardedPrice?: number;
  awardedAt?: string;
  awardedMessageSent?: string;
  awardReasoning?: {
    reasonType: string;
    note?: string;
    awardedAt: string;
    awardedBy: string;
  };
  
  // Completion and rating metadata
  completedAt?: string;
  completedBy?: {
    uid: string;
    name: string;
  };
  rating?: RfqRating;

  createdBy: {
    uid: string;
    name: string;
    email?: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VendorReviewRecord {
  id: string; // rfqId
  rfqId: string;
  rfqTitle: string;
  rfqCategory?: string;
  awardedPrice?: number;
  stars: number;
  wouldRehire: boolean;
  tags: string[];
  comment?: string;
  ratedAt: string;
  ratedBy: {
    uid: string;
    name: string;
  };
}

export type QuoteSubmissionStatus = 'submitted' | 'accepted' | 'declined';

export interface VendorQuoteSubmission {
  id: string;
  rfqId: string;
  tenantId: string;
  ticketId?: string;
  
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  vendorType: VendorType;
  companyId?: string; // ח.פ. / ת.ז.
  
  // Pricing
  price: number;
  priceIncludesVat: boolean;
  totalPriceWithVat: number;
  
  // Terms & Delivery
  estimatedDuration: string; // e.g. "עד שעתיים", "חצי יום", "יום עבודה מלא", "2-3 ימי עבודה"
  notes?: string;
  quoteDocumentUrl?: string; // Official PDF or image attachment
  
  status: QuoteSubmissionStatus;
  submittedAt: string;
  updatedAt?: string;
  tokenHash?: string;
}
