import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Check, ShareNetwork } from "@phosphor-icons/react"
import { toast } from "sonner"

interface ShareCollectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareCollectionModal({ open, onOpenChange }: ShareCollectionModalProps) {
  const [shareToken, setShareToken] = useKV<string>("shareToken", "")
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState("")

  useEffect(() => {
    if (open && !shareToken) {
      const newToken = "collector_" + Date.now()
      setShareToken(newToken)
    }
  }, [open, shareToken, setShareToken])

  useEffect(() => {
    if (shareToken) {
      const encodedToken = btoa(shareToken)
      setShareUrl(`${window.location.origin}/shared/${encodedToken}`)
    }
  }, [shareToken])

  const handleCopy = async () => {
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
    const text = "Check out my luxury watch collection on WatchVault"
    const encodedUrl = encodeURIComponent(shareUrl)
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodedUrl}`
    window.open(twitterUrl, "_blank", "noopener,noreferrer")
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
