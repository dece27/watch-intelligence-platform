import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface WelcomeModalProps {
  open: boolean
  onAddWatch: () => void
}

export function WelcomeModal({ open, onAddWatch }: WelcomeModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl text-primary">◈</span>
            <DialogTitle className="text-2xl">Welcome to WatchVault</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            Your watch portfolio intelligence platform. Start by adding your first watch to unlock
            analytics, market insights, AI recommendations, and professional appraisal tools.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end pt-4">
          <Button onClick={onAddWatch} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Add Your First Watch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
