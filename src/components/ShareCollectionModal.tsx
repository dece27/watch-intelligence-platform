import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Check, ShareNetwork } from "@phosphor-icons/react"
import { toast } from "sonner"
import { SharedCollectionRecord, Watch } from "@/lib/types"

interface ShareCollectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  vaultName: string
  watches: Watch[]
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
}

export function ShareCollectionModal({ open, onOpenChange, userId, vaultName, watches }: ShareCollectionModalProps) {
  const [copied, setCopied] = useState(false)
  const [customSlug, setCustomSlug] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    if (open) {
      const suggested = sanitizeSlug(vaultName || `collection-${Date.now()}`)
      setCustomSlug(suggested || `collection-${Date.now()}`)
      setShareUrl("")
      setCopied(false)
    }
  }, [open, vaultName])

  const handleCopy = async () => {
    if (!shareUrl) {
      toast.error("Publish the share link first")
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error("Failed to copy link")
    }
  }

  const handleShareTwitter = () => {
    if (!shareUrl) {
      toast.error("Publish the share link first")
      return
    }

    const text = "Check out my luxury watch collection on WatchVault"
    const encodedUrl = encodeURIComponent(shareUrl)
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodedUrl}`
    window.open(twitterUrl, "_blank", "noopener,noreferrer")
  }

  const handlePublish = async () => {
    if (!userId) {
      toast.error("Sign in to create a share link")
      return
    }

    const slug = sanitizeSlug(customSlug)
    if (slug.length < 3) {
      toast.error("Custom URL must be at least 3 characters")
      return
    }

    setIsPublishing(true)
    try {
      const key = `shared_collection_${slug}`
      const existing = await window.spark.kv.get<SharedCollectionRecord>(key)

      if (existing && existing.ownerUserId !== userId) {
        toast.error("That URL is already taken. Try a different custom URL.")
        return
      }

      const now = new Date().toISOString()
      const record: SharedCollectionRecord = {
        slug,
        ownerUserId: userId,
        ownerVaultName: vaultName,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        watches: watches.map((watch) => ({
          id: watch.id,
          brand: watch.brand,
          model: watch.model,
          referenceNumber: watch.referenceNumber,
          year: watch.year,
          currentValue: watch.currentValue,
          condition: watch.condition,
          category: watch.category,
          imageUrl: watch.imageUrl,
          movement: watch.movement,
          caseMaterial: watch.caseMaterial,
          caseDiameter: watch.caseDiameter,
          notes: watch.notes,
          hasBox: watch.hasBox,
          hasPapers: watch.hasPapers,
        })),
      }

      await window.spark.kv.set(key, record)
      setCustomSlug(slug)
      setShareUrl(`${window.location.origin}/shared/${encodeURIComponent(slug)}`)
      toast.success(existing ? "Share link updated" : "Share link created")
    } catch (error) {
      console.error("Failed to publish shared collection:", error)
      toast.error("Failed to publish share link")
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Your Collection</DialogTitle>
          <DialogDescription>
            Anyone with this link can view your collection in read-only mode.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Custom URL</label>
            <div className="flex items-center rounded-md border border-input bg-background px-3">
              <span className="text-xs text-muted-foreground whitespace-nowrap pr-2">
                {window.location.origin}/shared/
              </span>
              <Input
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="my-watch-vault"
                className="border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">Use letters, numbers, and dashes only.</p>
          </div>

          <Button onClick={handlePublish} disabled={isPublishing} className="w-full">
            {isPublishing ? "Publishing..." : "Create / Update Share Link"}
          </Button>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="font-mono text-sm bg-muted/20"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                onClick={handleCopy}
                variant="outline"
                className="shrink-0"
                disabled={!shareUrl}
              >
                {copied ? (
                  <>
                    <Check className="mr-2" size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2" size={16} />
                    Copy Link
                  </>
                )}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleShareTwitter}
            className="w-full bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white"
            disabled={!shareUrl}
          >
            <ShareNetwork className="mr-2" size={18} />
            Share on Twitter/X
          </Button>

          <div className="bg-muted/10 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Privacy note:</strong> Your purchase prices are hidden in shared view.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
