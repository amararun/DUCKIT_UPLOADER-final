import { useState, useRef, useEffect } from 'react'
import { Upload, FolderOpen, LogOut, User, LogIn, ChevronDown } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { isNeonAuthConfigured } from '../../lib/neon-client'

interface HeaderProps {
  onMyFilesClick?: () => void
}

export function Header({ onMyFilesClick }: HeaderProps) {
  const { user, isAllowed, signInWithGoogle, signOut, isLoading } = useAuth()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header
      className="py-3 px-4"
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Line 1: DuckDB logo, Logo, Tagline, Works with + xlwings, TIGZIG */}
        <div className="flex items-center gap-3">
          {/* DuckDB logo */}
          <a
            href="https://duckdb.org"
            target="_blank"
            rel="noopener noreferrer"
            title="DuckDB"
            className="flex-shrink-0"
          >
            <img src="/logos/DuckDB_icon-lightmode.png" alt="DuckDB" className="h-10 w-10" />
          </a>

          {/* Divider */}
          <div className="h-8 w-px hidden sm:block" style={{ backgroundColor: '#E2E8F0' }} />

          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Upload className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: '#DC2626' }} />
            <span
              className="text-2xl sm:text-3xl font-bold"
              style={{ color: '#0F172A' }}
            >
              DuckIt
            </span>
          </div>

          {/* Divider */}
          <div className="h-6 w-px hidden md:block" style={{ backgroundColor: '#E2E8F0' }} />

          {/* Tagline - hidden on small screens */}
          <span
            className="text-lg md:text-[1.75rem] font-semibold hidden md:block"
            style={{ color: '#0F172A' }}
          >
            DuckDB & Parquet for xlwings Lite
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Works with + xlwings logo - hidden on small screens */}
          <div className="items-center gap-2 hidden lg:flex">
            <span className="text-base font-bold" style={{ color: '#1E293B' }}>Works with</span>
            <a
              href="https://lite.xlwings.org"
              target="_blank"
              rel="noopener noreferrer"
              title="xlwings Lite"
            >
              <img src="/logos/xlwings-lite.png" alt="xlwings Lite" className="h-13" style={{ height: '3.25rem' }} />
            </a>
          </div>

          {/* Divider before TIGZIG */}
          <div className="h-8 w-px ml-3 hidden lg:block" style={{ backgroundColor: '#E2E8F0' }} />

          {/* TIGZIG branding */}
          <a
            href="https://www.tigzig.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xl sm:text-3xl font-bold hover:underline hidden lg:block"
            style={{ color: '#0F172A' }}
          >
            TIGZIG
          </a>
        </div>

        {/* Line 2: Description (left) + Auth (right) */}
        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid #F1F5F9' }}>
          {/* Description */}
          <p className="text-base sm:text-lg font-medium" style={{ color: '#15803D' }}>
            Convert flat files to DuckDB, create shareable links for xlwings Lite or other apps, or download locally for offline use
          </p>

          {/* Auth section - on the right of line 2 */}
          {isNeonAuthConfigured && !isLoading && (
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              {user ? (
                // Logged in - show icon with dropdown
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex items-center gap-1 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title={user.email}
                  >
                    <User className="h-5 w-5" style={{ color: '#334155' }} />
                    {isAllowed && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Pro
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4" style={{ color: '#64748B' }} />
                  </button>

                  {/* Dropdown menu */}
                  {showDropdown && (
                    <div
                      className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-2 min-w-[200px] z-50"
                    >
                      {/* User email */}
                      <div className="px-4 py-2 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-800">{user.email}</p>
                        {isAllowed && (
                          <p className="text-xs text-green-600 font-medium mt-0.5">Pro Account</p>
                        )}
                      </div>

                      {/* My Files - show for all signed-in users */}
                      <button
                        onClick={() => {
                          setShowDropdown(false)
                          onMyFilesClick?.()
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium text-sm"
                      >
                        <FolderOpen className="h-4 w-4" />
                        My Files
                      </button>

                      {/* Sign out */}
                      <button
                        onClick={async () => {
                          setShowDropdown(false)
                          try {
                            await signOut()
                          } catch (err) {
                            console.error('Sign out failed:', err)
                            window.location.reload()
                          }
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium text-sm"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Not logged in - prominent sign in button
                <button
                  onClick={() => signInWithGoogle()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-slate-100"
                  style={{ color: '#334155', border: '1px solid #CBD5E1' }}
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
