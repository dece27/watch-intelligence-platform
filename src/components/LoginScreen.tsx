import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Watch as WatchIcon } from "@phosphor-icons/react"
import { User } from "@/lib/types"

interface LoginScreenProps {
  onLogin: (user: User) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [vaultName, setVaultName] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim() || !email.trim() || !vaultName.trim()) {
      return
    }

    setIsLoading(true)

    const emailKey = `user_email_${email.trim().toLowerCase()}`
    const existingUserId = await window.spark.kv.get<string>(emailKey)

    let userId: string
    let createdAt: string

    if (existingUserId) {
      userId = existingUserId
      const existingUser = await window.spark.kv.get<User>(`user_${existingUserId}`)
      createdAt = existingUser?.createdAt || new Date().toISOString()
    } else {
      userId = `user_${Date.now()}`
      createdAt = new Date().toISOString()
      await window.spark.kv.set(emailKey, userId)
    }

    const user: User = {
      id: userId,
      name: name.trim(),
      email: email.trim(),
      vaultName: vaultName.trim(),
      createdAt
    }

    await window.spark.kv.set(`user_${userId}`, user)

    setTimeout(() => {
      onLogin(user)
      setIsLoading(false)
    }, 500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(201,168,76,0.05),transparent_50%)]" />
      
      <Card className="w-full max-w-md relative backdrop-blur-sm bg-card/80 border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <WatchIcon size={32} weight="duotone" className="text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl">WatchVault</CardTitle>
          <CardDescription className="text-base">
            Create your personal luxury watch portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vaultName">Vault Name</Label>
              <Input
                id="vaultName"
                type="text"
                placeholder="e.g., My Collection, John's Timepieces"
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Choose a name for your watch collection vault
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Creating Vault..." : "Enter Vault"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/50">
            <p className="text-xs text-center text-muted-foreground">
              Your data is stored securely and privately in your browser.
              <br />
              Each collector gets their own isolated vault.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
