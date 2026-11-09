'use client'

import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { api, AuthUser, SignupPayload, UserRole } from './api'
import { isAppHost } from './siteHost'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (data: SignupPayload) => Promise<void>
  logout: () => Promise<void>
  switchOrganization: (organizationId: number) => Promise<void>
  refreshUser: () => Promise<void>
  // Role helpers
  isSuperAdmin: boolean
  isEventManager: boolean   // event_manager OR super_admin
  isCheckInStaff: boolean   // check_in_staff OR above
  isScanner: boolean        // scanner role only — QR scan access, no guest list
  can: (minRole: UserRole) => boolean
}

const ROLE_RANK: Record<UserRole, number> = {
  super_admin:    5,
  event_manager:  4,
  check_in_staff: 3,
  scanner:        2,
  viewer:         1,
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // On mount, try to restore session from the backend
  useEffect(() => {
    // Organization domains serve public pages only; sessions live on the app domain.
    if (!isAppHost(window.location.host)) {
      setLoading(false)
      return
    }
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await api.login(username, password)
    setUser(u)
    // Navigation is handled by the calling page (supports ?next= redirect)
  }, [])

  const signup = useCallback(async (data: SignupPayload) => {
    const nextUser = await api.signup(data)
    setUser(nextUser)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setUser(null)
    router.replace('/login')
  }, [router])

  const refreshUser = useCallback(async () => {
    const nextUser = await api.me()
    setUser(nextUser)
  }, [])

  const switchOrganization = useCallback(async (organizationId: number) => {
    if (user?.active_organization?.id === organizationId) return
    await api.activateOrganization(organizationId)
    const nextUser = await api.me()
    setUser(nextUser)
    window.location.assign('/admin/today')
  }, [user])

  const can = useCallback((minRole: UserRole) => {
    if (!user) return false
    return (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
  }, [user])

  const value: AuthContextValue = {
    user,
    loading,
    login,
    signup,
    logout,
    switchOrganization,
    refreshUser,
    isSuperAdmin:   user?.role === 'super_admin',
    isEventManager: can('event_manager'),
    isCheckInStaff: can('check_in_staff'),
    isScanner:      user?.role === 'scanner',
    can,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Redirects to /login if not authenticated. Use in admin pages. */
export function useRequireAuth(minRole?: UserRole) {
  const { user, loading, can } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    // Scanners can only access the check-in page
    if (user.role === 'scanner' && minRole && minRole !== 'scanner') {
      router.replace('/admin/door-desk'); return
    }
    if (minRole && !can(minRole)) { router.replace('/admin/today'); return }
  }, [user, loading, minRole, can, router])

  return { user, loading }
}
