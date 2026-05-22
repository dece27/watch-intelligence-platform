export interface Watch {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  serialNumber?: string
  year?: number
  purchasePrice: number
  purchaseDate: string
  currentValue?: number
  condition: 'mint' | 'excellent' | 'good' | 'fair'
  category: 'dress' | 'sport' | 'dive' | 'pilot' | 'chronograph' | 'complications'
  imageUrl?: string
  movement?: string
  caseMaterial?: string
  caseDiameter?: string
  notes?: string
  hasBox?: boolean
  hasPapers?: boolean
}

export interface Deal {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  price: number
  currency?: string
  marketValue?: number
  fairValue?: number
  discount: number
  condition: string
  seller: string
  location: string
  source?: string
  sourceUrl?: string
  listedAt?: string
  aiReasoning?: string
  imageUrl?: string
  matchScore: number
  dealScore?: number
  daysListed?: number
  sellerRating?: number
  hasBox?: boolean
  hasPapers?: boolean
  year?: number
}

export interface MarketSignal {
  type: 'buy' | 'hold' | 'sell'
  title: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  watchId: string
}

export interface PriceAlert {
  id: string
  watchRef: string
  brand: string
  model: string
  condition: 'above' | 'below'
  targetPrice: number
  createdAt: string
}

export interface BrandIndex {
  brand: string
  currentIndex: number
  change30d: number
  change90d: number
  change180d: number
  trend: number[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface User {
  id: string
  name: string
  email: string
  vaultName: string
  createdAt: string
  avatarUrl?: string
}

export interface DealsPreferences {
  preferredBrands: string[]
  selectedBrand: string
  condition: string
  maxPrice: number
  minDiscount: number
  minSellerRating: number
  requireBox: boolean
  requirePapers: boolean
  aiOnlyTop: boolean
  sortBy: 'ai-match' | 'discount' | 'price-asc' | 'price-desc' | 'newest'
}

export interface UserPreferences {
  userId: string
  deals?: DealsPreferences
  updatedAt: string
}

export interface AuthRecord {
  userId: string
  passwordHash: string
  salt: string
  iterations: number
  failedAttempts: number
  loginCount?: number
  lockUntil?: string
  lastLoginAt?: string
  lastFailedAt?: string
}

export interface VaultMetadata {
  userId: string
  vaultName: string
  createdAt: string
  lastAccessed: string
  watchCount: number
  totalValue: number
}
