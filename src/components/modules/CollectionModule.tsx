import { useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Plus, Pencil, Trash, MagnifyingGlass, X, ShareNetwork, FileArrowUp } from "@phosphor-icons/react"
import { toast } from "sonner"
import { ShareCollectionModal } from "@/components/ShareCollectionModal"
import { ImportCSVModal } from "@/components/ImportCSVModal"

interface CollectionModuleProps {
  watches: Watch[]
  onUpdate: (watches: Watch[]) => void
}

const WATCH_BRANDS = [
  'Rolex',
  'Patek Philippe',
  'Audemars Piguet',
  'IWC',
  'Omega',
  'Cartier',
  'Jaeger-LeCoultre',
  'Vacheron Constantin',
  'A. Lange & Söhne',
  'Tudor',
  'Grand Seiko',
  'Other'
]

export function CollectionModule({ watches, onUpdate }: CollectionModuleProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [editingWatch, setEditingWatch] = useState<Watch | null>(null)
  const [detailWatch, setDetailWatch] = useState<Watch | null>(null)
  const [formData, setFormData] = useState<Partial<Watch>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [brandFilter, setBrandFilter] = useState<string>('all')

  const filteredWatches = watches.filter(watch => {
    const matchesSearch = searchQuery === '' || 
      watch.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      watch.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      watch.referenceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesBrand = brandFilter === 'all' || 
      watch.brand === brandFilter ||
      (brandFilter === 'Other' && !['Rolex', 'Patek Philippe', 'Audemars Piguet'].includes(watch.brand))
    
    return matchesSearch && matchesBrand
  })

  const handleAdd = () => {
    setFormData({
      condition: 'excellent',
      category: 'dress',
      hasBox: false,
      hasPapers: false
    })
    setEditingWatch(null)
    setIsAddOpen(true)
  }

  const handleEdit = (watch: Watch) => {
    setFormData(watch)
    setEditingWatch(watch)
    setIsAddOpen(true)
  }

  const handleViewDetail = (watch: Watch) => {
    setDetailWatch(watch)
    setIsDetailOpen(true)
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to remove this watch from your collection?')) {
      onUpdate(watches.filter(w => w.id !== id))
      toast.success("Watch removed from collection")
      setIsDetailOpen(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.brand || !formData.model || !formData.purchasePrice || !formData.purchaseDate) {
      toast.error("Please fill in all required fields")
      return
    }

    const watch: Watch = {
      id: editingWatch?.id || `watch-${Date.now()}`,
      brand: formData.brand,
      model: formData.model,
      referenceNumber: formData.referenceNumber,
      serialNumber: formData.serialNumber,
      year: formData.year,
      purchasePrice: Number(formData.purchasePrice),
      purchaseDate: formData.purchaseDate,
      currentValue: formData.currentValue ? Number(formData.currentValue) : undefined,
      condition: formData.condition || 'excellent',
      category: formData.category || 'dress',
      imageUrl: formData.imageUrl,
      movement: formData.movement,
      caseMaterial: formData.caseMaterial,
      caseDiameter: formData.caseDiameter,
      notes: formData.notes,
      hasBox: formData.hasBox || false,
      hasPapers: formData.hasPapers || false
    }

    if (editingWatch) {
      onUpdate(watches.map(w => w.id === watch.id ? watch : w))
      toast.success("Watch updated successfully")
    } else {
      onUpdate([...watches, watch])
      toast.success("Watch added to collection")
    }

    setIsAddOpen(false)
    setFormData({})
  }

  const handleImportWatches = (importedWatches: Watch[]) => {
    onUpdate([...watches, ...importedWatches])
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Collection Vault</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">{watches.length} {watches.length === 1 ? 'watch' : 'watches'} in your portfolio</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          <Button onClick={() => setIsImportOpen(true)} variant="outline" className="flex-1 md:flex-none" size="sm">
            <FileArrowUp className="mr-2" />
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button onClick={() => setIsShareOpen(true)} variant="outline" className="flex-1 md:flex-none" size="sm">
            <ShareNetwork className="mr-2" />
            <span className="hidden sm:inline">Share Collection</span>
            <span className="sm:hidden">Share</span>
          </Button>
          <Button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground flex-1 md:flex-none" size="sm">
            <Plus className="mr-2" />
            <span className="hidden sm:inline">Add Watch</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search by brand, model, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          )}
        </div>
        
        <Tabs value={brandFilter} onValueChange={setBrandFilter} className="w-full md:w-auto">
          <TabsList className="w-full md:w-auto grid grid-cols-5 md:inline-flex">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="Rolex">Rolex</TabsTrigger>
            <TabsTrigger value="Patek Philippe" className="text-xs md:text-sm">Patek</TabsTrigger>
            <TabsTrigger value="Audemars Piguet" className="text-xs md:text-sm">AP</TabsTrigger>
            <TabsTrigger value="Other">Other</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredWatches.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery || brandFilter !== 'all' ? (
              <div>
                <p className="mb-4">No watches found matching your filters</p>
                <Button variant="outline" onClick={() => { setSearchQuery(''); setBrandFilter('all') }}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-4">Your collection is empty</p>
                <Button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="mr-2" />
                  Add Your First Watch
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWatches.map((watch) => (
            <Card 
              key={watch.id} 
              className="bg-card border-border hover:bg-card/80 transition-all duration-200 cursor-pointer group"
              onClick={() => handleViewDetail(watch)}
            >
              <CardHeader className="pb-3">
                {watch.imageUrl ? (
                  <div className="w-full h-48 bg-muted/20 rounded-lg mb-3 overflow-hidden">
                    <img 
                      src={watch.imageUrl} 
                      alt={`${watch.brand} ${watch.model}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%230A0A0B" width="200" height="200"/%3E%3Ctext fill="%23C9A84C" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Georgia" font-size="16"%3E◈%3C/text%3E%3C/svg%3E'
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-muted/20 rounded-lg mb-3 flex items-center justify-center text-primary">
                    <span className="text-6xl">◈</span>
                  </div>
                )}
                <CardTitle className="text-xl">{watch.brand}</CardTitle>
                <p className="text-muted-foreground text-sm">{watch.model}</p>
                {watch.referenceNumber && (
                  <p className="text-muted-foreground text-xs">Ref. {watch.referenceNumber}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Purchase Price</span>
                  <span className="font-medium tabular-nums">${watch.purchasePrice.toLocaleString()}</span>
                </div>
                {watch.currentValue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Value</span>
                    <span className="font-medium text-success tabular-nums">${watch.currentValue.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Condition</span>
                  <span className="capitalize">{watch.condition}</span>
                </div>
                {(watch.hasBox || watch.hasPapers) && (
                  <div className="flex gap-2 text-xs pt-2">
                    {watch.hasBox && <span className="px-2 py-1 bg-primary/10 text-primary rounded">Box</span>}
                    {watch.hasPapers && <span className="px-2 py-1 bg-primary/10 text-primary rounded">Papers</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWatch ? 'Edit Watch' : 'Add Watch to Collection'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Brand *</Label>
                <Select
                  value={formData.brand || ''}
                  onValueChange={(value) => setFormData({ ...formData, brand: value })}
                >
                  <SelectTrigger id="brand">
                    <SelectValue placeholder="Select brand..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WATCH_BRANDS.map(brand => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  value={formData.model || ''}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g., Submariner, Nautilus"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="referenceNumber">Reference Number</Label>
                <Input
                  id="referenceNumber"
                  value={formData.referenceNumber || ''}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  placeholder="e.g., 126610LN"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={formData.serialNumber || ''}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="e.g., M12345678"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || undefined })}
                  placeholder="e.g., 2023"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition">Condition *</Label>
                <Select
                  value={formData.condition || 'excellent'}
                  onValueChange={(value: Watch['condition']) => setFormData({ ...formData, condition: value })}
                >
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mint">Mint</SelectItem>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase Price * ($)</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  value={formData.purchasePrice || ''}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g., 10000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date *</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={formData.purchaseDate || ''}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentValue">Current Est. Value ($)</Label>
                <Input
                  id="currentValue"
                  type="number"
                  value={formData.currentValue || ''}
                  onChange={(e) => setFormData({ ...formData, currentValue: parseFloat(e.target.value) || undefined })}
                  placeholder="e.g., 12000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category || 'dress'}
                  onValueChange={(value: Watch['category']) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dress">Dress</SelectItem>
                    <SelectItem value="sport">Sport</SelectItem>
                    <SelectItem value="dive">Dive</SelectItem>
                    <SelectItem value="pilot">Pilot</SelectItem>
                    <SelectItem value="chronograph">Chronograph</SelectItem>
                    <SelectItem value="complications">Complications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <Label htmlFor="hasBox" className="cursor-pointer">Box Included</Label>
                <Switch
                  id="hasBox"
                  checked={formData.hasBox || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, hasBox: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <Label htmlFor="hasPapers" className="cursor-pointer">Papers Included</Label>
                <Switch
                  id="hasPapers"
                  checked={formData.hasPapers || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, hasPapers: checked })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="movement">Movement</Label>
                <Input
                  id="movement"
                  value={formData.movement || ''}
                  onChange={(e) => setFormData({ ...formData, movement: e.target.value })}
                  placeholder="e.g., Automatic, Manual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="caseMaterial">Case Material</Label>
                <Input
                  id="caseMaterial"
                  value={formData.caseMaterial || ''}
                  onChange={(e) => setFormData({ ...formData, caseMaterial: e.target.value })}
                  placeholder="e.g., Stainless Steel, Gold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caseDiameter">Case Diameter</Label>
              <Input
                id="caseDiameter"
                value={formData.caseDiameter || ''}
                onChange={(e) => setFormData({ ...formData, caseDiameter: e.target.value })}
                placeholder="e.g., 40mm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Photo URL</Label>
              <Input
                id="imageUrl"
                value={formData.imageUrl || ''}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://example.com/watch-image.jpg"
              />
              {formData.imageUrl && (
                <div className="mt-2">
                  <img 
                    src={formData.imageUrl} 
                    alt="Preview" 
                    className="h-32 rounded border border-border object-cover"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any additional notes about this watch..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {editingWatch ? 'Update Watch' : 'Add Watch'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailWatch && (
            <>
              <DialogHeader>
                <DialogTitle>{detailWatch.brand} {detailWatch.model}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {detailWatch.imageUrl && (
                  <div className="w-full h-80 bg-muted/20 rounded-lg overflow-hidden">
                    <img 
                      src={detailWatch.imageUrl} 
                      alt={`${detailWatch.brand} ${detailWatch.model}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%230A0A0B" width="400" height="400"/%3E%3Ctext fill="%23C9A84C" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Georgia" font-size="48"%3E◈%3C/text%3E%3C/svg%3E'
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Brand</h3>
                      <p className="text-lg">{detailWatch.brand}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Model</h3>
                      <p className="text-lg">{detailWatch.model}</p>
                    </div>
                    {detailWatch.referenceNumber && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Reference Number</h3>
                        <p>{detailWatch.referenceNumber}</p>
                      </div>
                    )}
                    {detailWatch.serialNumber && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Serial Number</h3>
                        <p className="font-mono text-sm">{detailWatch.serialNumber}</p>
                      </div>
                    )}
                    {detailWatch.year && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Year</h3>
                        <p>{detailWatch.year}</p>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Condition</h3>
                      <p className="capitalize">{detailWatch.condition}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
                      <p className="capitalize">{detailWatch.category}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Purchase Price</h3>
                      <p className="text-lg font-semibold tabular-nums">${detailWatch.purchasePrice.toLocaleString()}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Purchase Date</h3>
                      <p>{new Date(detailWatch.purchaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    {detailWatch.currentValue && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Current Value</h3>
                        <p className="text-lg font-semibold text-success tabular-nums">${detailWatch.currentValue.toLocaleString()}</p>
                      </div>
                    )}
                    {detailWatch.movement && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Movement</h3>
                        <p>{detailWatch.movement}</p>
                      </div>
                    )}
                    {detailWatch.caseMaterial && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Case Material</h3>
                        <p>{detailWatch.caseMaterial}</p>
                      </div>
                    )}
                    {detailWatch.caseDiameter && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Case Diameter</h3>
                        <p>{detailWatch.caseDiameter}</p>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Accessories</h3>
                      <div className="flex gap-2">
                        {detailWatch.hasBox && <span className="px-3 py-1 bg-primary/10 text-primary rounded text-sm">Box</span>}
                        {detailWatch.hasPapers && <span className="px-3 py-1 bg-primary/10 text-primary rounded text-sm">Papers</span>}
                        {!detailWatch.hasBox && !detailWatch.hasPapers && <span className="text-sm text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {detailWatch.notes && (
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Notes</h3>
                    <p className="text-sm">{detailWatch.notes}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-border">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setIsDetailOpen(false)
                      handleEdit(detailWatch)
                    }}
                  >
                    <Pencil className="mr-2" size={16} />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 text-destructive border-destructive/50 hover:bg-destructive/10"
                    onClick={() => handleDelete(detailWatch.id)}
                  >
                    <Trash className="mr-2" size={16} />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ShareCollectionModal 
        open={isShareOpen} 
        onOpenChange={setIsShareOpen} 
      />

      <ImportCSVModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={handleImportWatches}
      />
    </div>
  )
}
