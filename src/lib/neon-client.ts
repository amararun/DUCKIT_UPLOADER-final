/**
 * Neon Auth Client
 * Auth-only client - Data API calls go through /api/db serverless proxy
 */

import { createAuthClient } from '@neondatabase/auth'

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL || ''

// Check if configured
export const isNeonConfigured = !!NEON_AUTH_URL
export const isNeonAuthConfigured = !!NEON_AUTH_URL

if (!NEON_AUTH_URL) {
  console.warn('⚠️ VITE_NEON_AUTH_URL is not set')
}

// Create auth-only client - Data API is handled by serverless proxy
const authClient = createAuthClient(NEON_AUTH_URL)

// Export auth client
export const neonAuth = authClient

// For compatibility with existing code that uses neonClient.auth
export const neonClient = {
  auth: authClient,
}
