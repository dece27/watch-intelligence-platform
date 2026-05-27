import { describe, expect, it, vi } from 'vitest'

import type { EnsureAdminAuthClient } from '../../functions/ensure-admin-auth/reconcileAdminAuth'
import { reconcileAdminAuthAccount } from '../../functions/ensure-admin-auth/reconcileAdminAuth'

function createClient(overrides?: {
  users?: Array<{ id: string; email?: string | null }>
  listError?: string | null
  createError?: string | null
  updateError?: string | null
}) {
  const listUsers = vi.fn(async () => ({
    data: { users: overrides?.users ?? [] },
    error: overrides?.listError ? { message: overrides.listError } : null,
  }))
  const createUser = vi.fn(async () => ({
    error: overrides?.createError ? { message: overrides.createError } : null,
  }))
  const updateUserById = vi.fn(async () => ({
    error: overrides?.updateError ? { message: overrides.updateError } : null,
  }))

  const client = {
    auth: {
      admin: {
        listUsers,
        createUser,
        updateUserById,
      },
    },
  } satisfies EnsureAdminAuthClient

  return { client, listUsers, createUser, updateUserById }
}

describe('reconcileAdminAuthAccount', () => {
  it('creates the administrator auth account when missing', async () => {
    const { client, createUser, updateUserById } = createClient()

    await reconcileAdminAuthAccount(client, 'administrator@watchvault.local', 'WatchVault')

    expect(createUser).toHaveBeenCalledWith({
      email: 'administrator@watchvault.local',
      password: 'WatchVault',
      email_confirm: true,
      user_metadata: { name: 'Administrator', vault_name: 'WatchVault' },
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('updates the existing administrator auth account with confirmed email and password', async () => {
    const { client, createUser, updateUserById } = createClient({
      users: [{ id: 'admin-user-id', email: 'administrator@watchvault.local' }],
    })

    await reconcileAdminAuthAccount(client, 'administrator@watchvault.local', 'WatchVault')

    expect(createUser).not.toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledWith('admin-user-id', {
      email_confirm: true,
      password: 'WatchVault',
    })
  })

  it('throws when listing users fails', async () => {
    const { client } = createClient({ listError: 'list failed' })

    await expect(
      reconcileAdminAuthAccount(client, 'administrator@watchvault.local', 'WatchVault'),
    ).rejects.toThrow('Failed to list users: list failed')
  })

  it('throws when creating a missing administrator auth account fails', async () => {
    const { client } = createClient({ createError: 'create failed' })

    await expect(
      reconcileAdminAuthAccount(client, 'administrator@watchvault.local', 'WatchVault'),
    ).rejects.toThrow('Failed to create admin user: create failed')
  })

  it('throws when reconciling an existing administrator auth account fails', async () => {
    const { client } = createClient({
      users: [{ id: 'admin-user-id', email: 'administrator@watchvault.local' }],
      updateError: 'update failed',
    })

    await expect(
      reconcileAdminAuthAccount(client, 'administrator@watchvault.local', 'WatchVault'),
    ).rejects.toThrow('Failed to reconcile admin user: update failed')
  })
})
