import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ChatCircleDots } from "@phosphor-icons/react"
import { toast } from "sonner"

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
  userEmail?: string
}

export function FeedbackModal({ open, onClose, userEmail }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast.error("Please enter your feedback")
      return
    }

    setIsSubmitting(true)

    const feedbackData = {
      feedback: feedback.trim(),
      userEmail: userEmail || "anonymous",
      timestamp: new Date().toISOString(),
      id: `feedback_${Date.now()}`
    }

    await window.spark.kv.set(`feedback_${feedbackData.id}`, feedbackData)

    const allFeedback = await window.spark.kv.get<string[]>("all_feedback_ids") || []
    await window.spark.kv.set("all_feedback_ids", [...allFeedback, feedbackData.id])

    toast.success("Thank you! Your feedback has been submitted.")
    
    setFeedback("")
    setIsSubmitting(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ChatCircleDots size={20} weight="duotone" className="text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Share Your Feedback</DialogTitle>
              <DialogDescription className="text-sm">
                Help us improve WatchVault
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">What do you think?</Label>
            <Textarea
              id="feedback"
              placeholder="Tell us what you like, what could be better, or any features you'd like to see..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Your feedback will help shape the future of WatchVault
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
