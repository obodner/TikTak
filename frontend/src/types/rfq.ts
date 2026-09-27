export type VendorType = 'retainer' | 'occasional';

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
}

export type RfqStatus = 'open' | 'awarded' | 'expired' | 'cancelled';

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
  
  createdBy: {
    uid: string;
    name: string;
    email?: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
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
