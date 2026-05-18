import { useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash } from "@phosphor-icons/react"
import { toast } from "sonner"

interface CollectionModuleProps {
  watches: Watch[]
  onUpdate: (watches: Watch[]) => void
}

export function CollectionModule({ watches, onUpdate }: CollectionModuleProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingWatch, setEditingWatch] = useState<Watch | null>(null)
  const [formData, setFormData] = useState<Partial<Watch>>({})

  const handleAdd = () => {
    setFormData({})
    setEditingWatch(null)
    setIsAddOpen(true)
  }

  const handleEdit = (watch: Watch) => {
    setFormData(watch)
    setEditingWatch(watch)
    setIsAddOpen(true)
  }

  const handleDelete = (id: string) => {
    onUpdate(watches.filter(w => w.id !== id))
    toast.success("Watch removed from collection")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.brand || !formData.model || !formData.purchasePrice || !formData.purchaseDate) {
      toast.error("Please fill in all required fields")
      return
    }

    const watch: Watch = {
      id: editingWatch?.id || Date.now().toString(),
      brand: formData.brand,
      model: formData.model,
      referenceNumber: formData.referenceNumber,
      year: formData.year,
      purchasePrice: Number(formData.purchasePrice),
      purchaseDate: formData.purchaseDate,
      currentValue: formData.currentValue ? Number(formData.currentValue) : formData.purchasePrice ? Number(formData.purchasePrice) : 0,
      condition: formData.condition || 'excellent',
      category: formData.category || 'dress',
      imageUrl: formData.imageUrl,
      movement: formData.movement,
      caseMaterial: formData.caseMaterial,
      caseDiameter: formData.caseDiameter,
      notes: formData.notes
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Collection</h1>
          <p className="text-muted-foreground mt-1">{watches.length} watches in your portfolio</p>
        </div>
        <Button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="mr-2" />
          Add Watch
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {watches.map((watch) => (
          <Card key={watch.id} className="bg-white/[0.025] border-white/[0.07] hover:bg-white/[0.035] transition-all duration-200">
            <CardHeader className="pb-3">
              {watch.imageUrl && (
                <div className="w-full h-48 bg-muted/20 rounded-lg mb-3 overflow-hidden">
                  <img 
                    src={watch.imageUrl} 
                    alt={`${watch.brand} ${watch.model}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext fill="%23666" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E'
                    }}
                  />
                </div>
              )}
              <CardTitle className="text-xl">{watch.brand}</CardTitle>
              <p className="text-muted-foreground">{watch.model}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Purchase Price</span>
                <span className="font-medium">${watch.purchasePrice.toLocaleString()}</span>
              </div>
              {watch.currentValue && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="font-medium text-success">${watch.currentValue.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Condition</span>
                <span className="capitalize">{watch.condition}</span>
              </div>
              <div className="flex gap-2 pt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleEdit(watch)}
                >
                  <Pencil className="mr-1" size={16} />
                  Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => handleDelete(watch.id)}
                >
                  <Trash size={16} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWatch ? 'Edit Watch' : 'Add Watch'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Brand *</Label>
                <Input
                  id="brand"
                  value={formData.brand || ''}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="e.g., Rolex, Patek Philippe"
                />
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
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || undefined })}
                  placeholder="e.g., 2023"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase Price *</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  value={formData.purchasePrice || ''}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g., 10000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentValue">Current Value</Label>
                <Input
                  id="currentValue"
                  type="number"
                  value={formData.currentValue || ''}
                  onChange={(e) => setFormData({ ...formData, currentValue: parseFloat(e.target.value) || undefined })}
                  placeholder="e.g., 12000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date *</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={formData.purchaseDate || ''}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition">Condition</Label>
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
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={formData.imageUrl || ''}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://example.com/watch-image.jpg"
              />
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
    </div>
  )
}
