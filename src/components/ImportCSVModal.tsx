import { useState, useRef } from "react"
import { Watch } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileArrowDown, Upload, WarningCircle } from "@phosphor-icons/react"
import { toast } from "sonner"

interface ImportCSVModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (watches: Watch[]) => void
}

const WATCH_BRANDS: { [key: string]: string } = {
  'rolex': 'Rolex',
  'patek': 'Patek Philippe',
  'patek philippe': 'Patek Philippe',
  'ap': 'Audemars Piguet',
  'audemars': 'Audemars Piguet',
  'audemars piguet': 'Audemars Piguet',
  'iwc': 'IWC',
  'omega': 'Omega',
  'cartier': 'Cartier',
  'jaeger': 'Jaeger-LeCoultre',
  'jaeger-lecoultre': 'Jaeger-LeCoultre',
  'vacheron': 'Vacheron Constantin',
  'vacheron constantin': 'Vacheron Constantin',
  'lange': 'A. Lange & Söhne',
  'a. lange & söhne': 'A. Lange & Söhne',
  'tudor': 'Tudor',
  'grand seiko': 'Grand Seiko',
  'seiko': 'Grand Seiko',
}

const CONDITIONS: { [key: string]: Watch['condition'] } = {
  'unworn': 'mint',
  'mint': 'mint',
  'excellent': 'excellent',
  'very good': 'excellent',
  'good': 'good',
  'fair': 'fair',
}

export function ImportCSVModal({ open, onOpenChange, onImport }: ImportCSVModalProps) {
  const [parsedWatches, setParsedWatches] = useState<Watch[]>([])
  const [skippedRows, setSkippedRows] = useState(0)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const normalizeBrand = (brand: string): string => {
    const lower = brand.toLowerCase().trim()
    return WATCH_BRANDS[lower] || brand
  }

  const normalizeCondition = (condition: string): Watch['condition'] => {
    const lower = condition.toLowerCase().trim()
    return CONDITIONS[lower] || 'excellent'
  }

  const parseBoolean = (value: string): boolean => {
    const lower = value.toLowerCase().trim()
    return lower === 'true' || lower === 'yes' || lower === '1'
  }

  const parsePrice = (value: string): number => {
    const cleaned = value.replace(/[$,]/g, '').trim()
    return parseFloat(cleaned) || 0
  }

  const downloadTemplate = () => {
    const headers = "brand,model,reference,year,condition,hasBox,hasPapers,purchasePrice,purchaseDate,serialNumber,notes"
    const sample = "Rolex,Submariner,124060,2022,Mint,true,true,9200,2022-06-15,,"
    const csv = headers + "\n" + sample
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'watchvault-template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("Template downloaded")
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError("Please select a CSV file")
      return
    }

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        setError("Could not parse file. Please use the CSV template.")
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const watches: Watch[] = []
      let skipped = 0

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim())
        const row: { [key: string]: string } = {}
        
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })

        const brand = normalizeBrand(row['brand'] || '')
        const model = row['model'] || ''
        const reference = row['reference'] || row['referencenumber'] || ''
        const purchasePrice = parsePrice(row['purchaseprice'] || '')

        if (!brand || !reference || !purchasePrice) {
          skipped++
          continue
        }

        const watch: Watch = {
          id: `watch-${Date.now()}-${i}`,
          brand,
          model,
          referenceNumber: reference,
          serialNumber: row['serialnumber'] || undefined,
          year: parseInt(row['year']) || undefined,
          purchasePrice,
          purchaseDate: row['purchasedate'] || new Date().toISOString().split('T')[0],
          condition: normalizeCondition(row['condition'] || 'excellent'),
          category: 'dress',
          hasBox: row['hasbox'] ? parseBoolean(row['hasbox']) : false,
          hasPapers: row['haspapers'] ? parseBoolean(row['haspapers']) : false,
          notes: row['notes'] || undefined,
        }

        watches.push(watch)
      }

      setParsedWatches(watches)
      setSkippedRows(skipped)
      setError("")
    } catch (err) {
      setError("Could not parse file. Please use the CSV template.")
      setParsedWatches([])
    }
  }

  const handleImport = () => {
    if (parsedWatches.length === 0) return
    
    onImport(parsedWatches)
    toast.success(`✓ ${parsedWatches.length} watches imported successfully`)
    
    setParsedWatches([])
    setSkippedRows(0)
    setError("")
    onOpenChange(false)
  }

  const handleClose = () => {
    setParsedWatches([])
    setSkippedRows(0)
    setError("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <div className="px-6 py-6 border-b border-border">
          <DialogHeader>
            <DialogTitle>Import Watches from CSV</DialogTitle>
          </DialogHeader>
        </div>
        
        <div className="max-h-[calc(90vh-80px)] overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-muted/10 border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <FileArrowDown className="text-primary shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-medium">Download Template</p>
                <p className="text-xs text-muted-foreground">
                  Use our CSV template with the correct headers and format.
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-2 bg-background/50 p-2 rounded">
                  brand,model,reference,year,condition,hasBox,hasPapers,purchasePrice,purchaseDate,serialNumber,notes
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-1 bg-background/50 p-2 rounded">
                  Rolex,Submariner,124060,2022,Mint,true,true,9200,2022-06-15,,
                </p>
              </div>
            </div>
            <Button onClick={downloadTemplate} variant="outline" size="sm" className="w-full">
              <FileArrowDown className="mr-2" size={16} />
              Download CSV Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">Upload CSV File</Label>
            <div className="flex gap-2">
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
              </Button>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3 flex items-start gap-2">
              <WarningCircle className="text-destructive shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {skippedRows > 0 && (
            <div className="bg-muted/20 border border-border rounded-lg p-3 flex items-start gap-2">
              <WarningCircle className="text-muted-foreground shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-muted-foreground">
                Skipped {skippedRows} rows with missing required fields
              </p>
            </div>
          )}

          {parsedWatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Preview</h3>
                <p className="text-xs text-muted-foreground">
                  {parsedWatches.length} watches ready to import
                </p>
              </div>
              
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedWatches.slice(0, 5).map((watch, index) => (
                      <TableRow key={index}>
                        <TableCell>{watch.brand}</TableCell>
                        <TableCell>{watch.model}</TableCell>
                        <TableCell className="font-mono text-xs">{watch.referenceNumber}</TableCell>
                        <TableCell>{watch.year || '—'}</TableCell>
                        <TableCell className="capitalize">{watch.condition}</TableCell>
                        <TableCell className="text-right tabular-nums">${watch.purchasePrice.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {parsedWatches.length > 5 && (
                <p className="text-xs text-center text-muted-foreground">
                  and {parsedWatches.length - 5} more...
                </p>
              )}

              <Button 
                onClick={handleImport} 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Import {parsedWatches.length} {parsedWatches.length === 1 ? 'Watch' : 'Watches'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
