import { useState } from "react"
import { Deal } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Heart, MapPin } from "@phosphor-icons/react"

interface DealsModuleProps {
  userBrands: string[]
}

const sampleDeals: Deal[] = [
  {
    id: '1',
    brand: 'Omega',
    model: 'Speedmaster Professional',
    price: 4800,
    marketValue: 5500,
    discount: 13,
    condition: 'Excellent',
    seller: 'Crown & Caliber',
    location: 'Atlanta, GA',
    matchScore: 92,
    imageUrl: 'https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=400'
  },
  {
    id: '2',
    brand: 'Rolex',
    model: 'Submariner Date',
    price: 12500,
    marketValue: 14000,
    discount: 11,
    condition: 'Very Good',
    seller: 'WatchBox',
    location: 'Philadelphia, PA',
    matchScore: 88,
    imageUrl: 'https://images.unsplash.com/photo-1587836374775-5b78d194324c?w=400'
  },
  {
    id: '3',
    brand: 'Tudor',
    model: 'Black Bay 58',
    price: 3200,
    marketValue: 3600,
    discount: 11,
    condition: 'Mint',
    seller: 'Bob\'s Watches',
    location: 'Newport Beach, CA',
    matchScore: 85,
    imageUrl: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=400'
  },
  {
    id: '4',
    brand: 'Patek Philippe',
    model: 'Calatrava',
    price: 18900,
    marketValue: 22000,
    discount: 14,
    condition: 'Excellent',
    seller: 'Chrono24 Seller',
    location: 'New York, NY',
    matchScore: 90,
    imageUrl: 'https://images.unsplash.com/photo-1594534475808-b18fc33b045e?w=400'
  },
  {
    id: '5',
    brand: 'IWC',
    model: 'Pilot\'s Watch Mark XVIII',
    price: 3750,
    marketValue: 4200,
    discount: 11,
    condition: 'Very Good',
    seller: 'Hodinkee Shop',
    location: 'New York, NY',
    matchScore: 82,
    imageUrl: 'https://images.unsplash.com/photo-1548171915-e79a380a2a4b?w=400'
  }
]

export function DealsModule({ userBrands }: DealsModuleProps) {
  const [filter, setFilter] = useState<string>('all')
  const [favorites, setFavorites] = useState<string[]>([])

  const filteredDeals = filter === 'all' 
    ? sampleDeals 
    : sampleDeals.filter(deal => deal.brand === filter)

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) 
        ? prev.filter(fid => fid !== id)
        : [...prev, id]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Deal Flow</h1>
          <p className="text-muted-foreground mt-1">Curated acquisition opportunities</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            <SelectItem value="Rolex">Rolex</SelectItem>
            <SelectItem value="Omega">Omega</SelectItem>
            <SelectItem value="Patek Philippe">Patek Philippe</SelectItem>
            <SelectItem value="Tudor">Tudor</SelectItem>
            <SelectItem value="IWC">IWC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDeals.map((deal) => (
          <Card key={deal.id} className="bg-white/[0.025] border-white/[0.07] hover:bg-white/[0.035] transition-all duration-200">
            <CardHeader className="pb-3">
              <div className="relative">
                {deal.imageUrl && (
                  <div className="w-full h-48 bg-muted/20 rounded-lg mb-3 overflow-hidden">
                    <img 
                      src={deal.imageUrl} 
                      alt={`${deal.brand} ${deal.model}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext fill="%23666" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E'
                      }}
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                  onClick={() => toggleFavorite(deal.id)}
                >
                  <Heart 
                    size={20} 
                    weight={favorites.includes(deal.id) ? 'fill' : 'regular'} 
                    className={favorites.includes(deal.id) ? 'text-primary' : 'text-white'}
                  />
                </Button>
                <Badge className="absolute top-2 left-2 bg-success text-success-foreground">
                  {deal.discount}% Below Market
                </Badge>
              </div>
              <CardTitle className="text-xl">{deal.brand}</CardTitle>
              <p className="text-muted-foreground">{deal.model}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="text-2xl font-semibold text-primary">${deal.price.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Market</div>
                  <div className="text-lg font-medium line-through text-muted-foreground">${deal.marketValue.toLocaleString()}</div>
                </div>
              </div>

              <div className="flex justify-between text-sm pt-2 border-t border-white/[0.05]">
                <span className="text-muted-foreground">Condition</span>
                <span className="font-medium">{deal.condition}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Match Score</span>
                <Badge variant="outline" className="tabular-nums">
                  {deal.matchScore}% Match
                </Badge>
              </div>

              <div className="flex items-center gap-1 text-sm text-muted-foreground pt-2">
                <MapPin size={14} />
                <span>{deal.location}</span>
              </div>

              <div className="text-xs text-muted-foreground">
                via {deal.seller}
              </div>

              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-3">
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
