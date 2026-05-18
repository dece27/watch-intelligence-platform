export interface Watch {
  id: string
  brand: string
  model: string
  referenceNumber?: string
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
}

export interface Deal {
  id: string
  brand: string
  model: string
  price: number
  marketValue: number
  discount: number
  condition: string
  seller: string
  location: string
  imageUrl?: string
  matchScore: number
}

export interface MarketSignal {
  type: 'opportunity' | 'warning' | 'insight'
  title: string
  description: string
  watchId?: string
}
