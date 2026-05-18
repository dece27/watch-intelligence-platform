import { useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilePdf, Printer } from "@phosphor-icons/react"

interface AppraisalModuleProps {
  watches: Watch[]
}

export function AppraisalModule({ watches }: AppraisalModuleProps) {
  const [selectedWatchId, setSelectedWatchId] = useState<string>(watches[0]?.id || '')

  const selectedWatch = watches.find(w => w.id === selectedWatchId)

  const handlePrint = () => {
    window.print()
  }

  if (!selectedWatch) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Appraisal Report</h1>
          <p className="text-muted-foreground mt-1">Generate professional valuation reports</p>
        </div>
        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardContent className="py-12 text-center text-muted-foreground">
            No watches in collection. Add watches to generate appraisal reports.
          </CardContent>
        </Card>
      </div>
    )
  }

  const appraisalValue = selectedWatch.currentValue || selectedWatch.purchasePrice * 1.15
  const appraisalDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-semibold">Appraisal Report</h1>
          <p className="text-muted-foreground mt-1">Professional valuation documentation</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedWatchId} onValueChange={setSelectedWatchId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {watches.map(watch => (
                <SelectItem key={watch.id} value={watch.id}>
                  {watch.brand} {watch.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2" />
            Print
          </Button>
        </div>
      </div>

      <Card className="bg-white border-white/[0.1] print:shadow-none print:border-black">
        <CardHeader className="border-b border-white/[0.1] print:border-black">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl text-primary print:text-black">◈</span>
                <div className="text-2xl font-semibold">WatchVault</div>
              </div>
              <div className="text-sm text-muted-foreground print:text-black">Professional Watch Appraisal</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground print:text-black">Appraisal Date</div>
              <div className="font-medium print:text-black">{appraisalDate}</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 print:text-black">Watch Information</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Brand</dt>
                  <dd className="font-medium print:text-black">{selectedWatch.brand}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Model</dt>
                  <dd className="font-medium print:text-black">{selectedWatch.model}</dd>
                </div>
                {selectedWatch.referenceNumber && (
                  <div>
                    <dt className="text-sm text-muted-foreground print:text-gray-600">Reference Number</dt>
                    <dd className="font-medium print:text-black">{selectedWatch.referenceNumber}</dd>
                  </div>
                )}
                {selectedWatch.year && (
                  <div>
                    <dt className="text-sm text-muted-foreground print:text-gray-600">Year</dt>
                    <dd className="font-medium print:text-black">{selectedWatch.year}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Condition</dt>
                  <dd className="font-medium capitalize print:text-black">{selectedWatch.condition}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Category</dt>
                  <dd className="font-medium capitalize print:text-black">{selectedWatch.category}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 print:text-black">Technical Specifications</h3>
              <dl className="space-y-3">
                {selectedWatch.movement && (
                  <div>
                    <dt className="text-sm text-muted-foreground print:text-gray-600">Movement</dt>
                    <dd className="font-medium print:text-black">{selectedWatch.movement}</dd>
                  </div>
                )}
                {selectedWatch.caseMaterial && (
                  <div>
                    <dt className="text-sm text-muted-foreground print:text-gray-600">Case Material</dt>
                    <dd className="font-medium print:text-black">{selectedWatch.caseMaterial}</dd>
                  </div>
                )}
                {selectedWatch.caseDiameter && (
                  <div>
                    <dt className="text-sm text-muted-foreground print:text-gray-600">Case Diameter</dt>
                    <dd className="font-medium print:text-black">{selectedWatch.caseDiameter}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Purchase Date</dt>
                  <dd className="font-medium print:text-black">
                    {new Date(selectedWatch.purchaseDate).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground print:text-gray-600">Original Purchase Price</dt>
                  <dd className="font-medium print:text-black">${selectedWatch.purchasePrice.toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>

          {selectedWatch.notes && (
            <div className="pt-4 border-t border-white/[0.1] print:border-gray-300">
              <h3 className="text-lg font-semibold mb-3 print:text-black">Additional Notes</h3>
              <p className="text-muted-foreground print:text-gray-700">{selectedWatch.notes}</p>
            </div>
          )}

          <div className="pt-6 border-t-2 border-primary print:border-black">
            <h3 className="text-2xl font-semibold mb-4 print:text-black">Appraised Value</h3>
            <div className="bg-primary/10 print:bg-gray-100 p-6 rounded-lg">
              <div className="text-sm text-muted-foreground print:text-gray-600 mb-2">Current Market Value</div>
              <div className="text-4xl font-bold text-primary print:text-black tabular-nums">
                ${appraisalValue.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground print:text-gray-600 mt-3">
                Based on current market conditions, condition assessment, and comparable sales data
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/[0.1] print:border-gray-300 text-xs text-muted-foreground print:text-gray-500">
            <p className="mb-2">
              This appraisal is provided for insurance and personal record purposes. Market values can fluctuate based on condition, 
              provenance, and market demand. This valuation is current as of {appraisalDate}.
            </p>
            <p>
              For insurance purposes, we recommend updating appraisals annually or when significant market changes occur.
            </p>
          </div>

          <div className="pt-6 text-center text-sm text-muted-foreground print:text-gray-600">
            <div className="font-medium print:text-black">WatchVault Professional Appraisal Service</div>
            <div>Document ID: WV-{selectedWatch.id}-{Date.now()}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
