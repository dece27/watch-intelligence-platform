import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, EyeSlash, Watch as WatchIcon } from "@phosphor-icons/react"
import { AuthRecord, User } from "@/lib/types"
import { hashPassword, verifyPassword } from "@/lib/auth"
import { Checkbox } from "@/components/ui/checkbox"
import { ensureUserIndexed } from "@/lib/adminAnalytics"
import { ensureDefaultAccount } from "@/lib/defaultAccount"

interface LoginScreenProps {
  onLogin: (user: User, rememberMe: boolean) => void | Promise<void>
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADMIN_LOGIN_IDENTIFIER = "administrator"

function isValidLoginIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === ADMIN_LOGIN_IDENTIFIER || EMAIL_REGEX.test(normalized)
}

export function shouldShowAccountCreationFields(loginIdentifier: string, isReturningUser: boolean): boolean {
  const normalized = loginIdentifier.trim().toLowerCase()
  return !isReturningUser && normalized !== ADMIN_LOGIN_IDENTIFIER
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [vaultName, setVaultName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isReturningUser, setIsReturningUser] = useState(false)
  const [isCheckingAccount, setIsCheckingAccount] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const normalizedEmailInput = email.trim().toLowerCase()
  const isAdministratorLogin = normalizedEmailInput === ADMIN_LOGIN_IDENTIFIER

  useEffect(() => {
    ensureDefaultAccount()
      .then(() => {
        setIsBootstrapped(true)
      })
      .catch((bootstrapError) => {
        console.error("Failed to bootstrap default account:", bootstrapError)
        // Allow the form to proceed; handleSubmit will retry ensureDefaultAccount.
        setIsBootstrapped(true)
      })
  }, [])

  useEffect(() => {
    if (!isBootstrapped) return

    let isCancelled = false
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !isValidLoginIdentifier(normalizedEmail)) {
      setIsReturningUser(false)
      return
    }

    const checkExistingUser = async () => {
      setIsCheckingAccount(true)
      try {
        const emailKey = `user_email_${normalizedEmail}`
        const existingUserId = await window.spark.kv.get<string>(emailKey)
        if (!isCancelled) {
          if (existingUserId) {
            // Verify the user profile actually exists; guards against stale keys
            // from partial registration failures or incomplete admin resets
            const userProfile = await window.spark.kv.get<User>(`user_${existingUserId}`)
            if (!userProfile) {
              await window.spark.kv.delete(emailKey)
              setIsReturningUser(false)
            } else {
              setIsReturningUser(true)
            }
          } else {
            setIsReturningUser(false)
          }
        }
      } finally {
        if (!isCancelled) {
          setIsCheckingAccount(false)
        }
      }
    }

    checkExistingUser()

    return () => {
      isCancelled = true
    }
  }, [email, isBootstrapped])

  const getLockoutMessage = (lockUntil?: string): string => {
    if (!lockUntil) return ""
    const lockTime = new Date(lockUntil).getTime()
    const now = Date.now()
    if (lockTime <= now) return ""
    const minutes = Math.ceil((lockTime - now) / 60_000)
    return `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setError("")
    const normalizedLoginIdentifier = email.trim().toLowerCase()
    const trimmedName = name.trim()
    const trimmedVaultName = vaultName.trim()

    if (!normalizedLoginIdentifier || !password.trim()) {
      setError("Email and passphrase are required.")
      return
    }

    if (!isValidLoginIdentifier(normalizedLoginIdentifier)) {
      setError("Enter a valid email address.")
      return
    }

    setIsLoading(true)

    try {
      await ensureDefaultAccount()
      const emailKey = `user_email_${normalizedLoginIdentifier}`
      const existingUserId = await window.spark.kv.get<string>(emailKey)

      if (existingUserId) {
        const user = await window.spark.kv.get<User>(`user_${existingUserId}`)
        const auth = await window.spark.kv.get<AuthRecord>(`auth_${existingUserId}`)

        if (!user || !auth) {
          setError("Your account data could not be loaded. Please contact support.")
          return
        }

        const lockoutMessage = getLockoutMessage(auth.lockUntil)
        if (lockoutMessage) {
          setError(lockoutMessage)
          return
        }

        const isValidPassword = await verifyPassword(password.trim(), auth)
        if (!isValidPassword) {
          const failedAttempts = (auth.failedAttempts || 0) + 1
          const shouldLock = failedAttempts >= 5
          await window.spark.kv.set(`auth_${existingUserId}`, {
            ...auth,
            failedAttempts: shouldLock ? 0 : failedAttempts,
            lockUntil: shouldLock ? new Date(Date.now() + 15 * 60_000).toISOString() : undefined,
            lastFailedAt: new Date().toISOString(),
          })
          setError("Invalid login credentials.")
          return
        }

        await window.spark.kv.set(`auth_${existingUserId}`, {
          ...auth,
          failedAttempts: 0,
          lockUntil: undefined,
          lastLoginAt: new Date().toISOString(),
          loginCount: (auth.loginCount || 0) + 1,
        })

        await ensureUserIndexed(user.id)
        await onLogin(user, rememberMe)
        return
      }

      if (normalizedLoginIdentifier === ADMIN_LOGIN_IDENTIFIER) {
        setError("Administrator account not found. Please verify system configuration or contact support.")
        return
      }

      if (!trimmedName || !trimmedVaultName) {
        setError("Name and vault name are required for new accounts.")
        return
      }

      if (password.trim().length < 10) {
        setError("Passphrase must be at least 10 characters.")
        return
      }

      if (password !== confirmPassword) {
        setError("Passphrase confirmation does not match.")
        return
      }

      const userId = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      const user: User = {
        id: userId,
        name: trimmedName,
        email: normalizedLoginIdentifier,
        vaultName: trimmedVaultName,
        createdAt,
      }
      const passwordPayload = await hashPassword(password.trim())

      await window.spark.kv.set(emailKey, userId)
      await window.spark.kv.set(`user_${userId}`, user)
      await window.spark.kv.set(`auth_${userId}`, {
        userId,
        ...passwordPayload,
        failedAttempts: 0,
        lastLoginAt: createdAt,
        loginCount: 1,
      } satisfies AuthRecord)
      await ensureUserIndexed(userId)

      await onLogin(user, rememberMe)
    } catch {
      setError("Unable to complete login. Please try again.")
    } finally {
      setIsLoading(false)
    }
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
            Securely access your personal luxury watch portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {isCheckingAccount && (
                <p className="text-xs text-muted-foreground">Checking account…</p>
              )}
            </div>

            {shouldShowAccountCreationFields(email, isReturningUser) && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                </div>
              </>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Passphrase</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <>
                      <EyeSlash size={14} className="mr-1" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye size={14} className="mr-1" />
                      Show
                    </>
                  )}
                </Button>
              </div>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={isReturningUser || isAdministratorLogin ? "Enter your passphrase" : "Create a secure passphrase"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {shouldShowAccountCreationFields(email, isReturningUser) && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Passphrase</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your passphrase"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                Keep me signed in on this device
              </Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Verifying..." : isReturningUser || isAdministratorLogin ? "Unlock Vault" : "Create Vault"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/50">
            <p className="text-xs text-center text-muted-foreground">
              Your credentials are protected with salted password hashing and account lockout safeguards.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
