import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getUserFiles, updateFileName, deleteFileRecord, isNeonDataConfigured, getUserRole, type FileRecord } from '../lib/neon-db'
import { Copy, Trash2, Edit2, Check, X, ExternalLink, FileText, Database } from 'lucide-react'

interface MyFilesProps {
  onClose: () => void
}

export function MyFiles({ onClose }: MyFilesProps) {
  const { user, isAllowed } = useAuth()
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'pro' | 'admin'>('pro')

  useEffect(() => {
    if (isNeonDataConfigured && user && isAllowed) {
      loadFiles()
      // Load user role
      getUserRole(user.email).then(setUserRole).catch(() => setUserRole('pro'))
    } else {
      setLoading(false)
    }
  }, [user, isAllowed])

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const loadFiles = async () => {
    if (!user?.email) return
    setLoading(true)
    const userFiles = await getUserFiles(user.email)
    setFiles(userFiles)
    setLoading(false)
  }

  const handleCopyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopySuccess(id)
      setTimeout(() => setCopySuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleStartEdit = (file: FileRecord) => {
    setEditingId(file.id)
    setEditName(file.display_name)
  }

  const handleSaveEdit = async (id: string) => {
    if (editName.trim() && user?.email) {
      const success = await updateFileName(id, editName.trim(), user.email)
      if (success) {
        setFiles(files.map(f => f.id === id ? { ...f, display_name: editName.trim() } : f))
      }
    }
    setEditingId(null)
    setEditName('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  const handleDelete = async (id: string) => {
    if (!user?.email) return
    if (confirm('Are you sure you want to delete this file? This will remove the file from the server.')) {
      const success = await deleteFileRecord(id, user.email)
      if (success) {
        setFiles(files.filter(f => f.id !== id))
      }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatSize = (sizeMb: number | null) => {
    if (!sizeMb) return '-'
    if (sizeMb < 1) return `${(sizeMb * 1024).toFixed(0)} KB`
    return `${sizeMb.toFixed(2)} MB`
  }

  const getFormatIcon = (format: string | null) => {
    if (format === 'duckdb') return <Database className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  if (!user || !isAllowed) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#000000' }}>My Files</h2>
          <p className="mb-4" style={{ color: '#000000' }}>
            You need to be logged in with an allowed account to view your files.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 font-medium rounded-lg transition-colors"
            style={{ color: '#000000' }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: '#000000' }}>My Persistent Files</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" style={{ color: '#000000' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-8" style={{ color: '#000000' }}>Loading files...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-3" style={{ color: '#000000' }} />
              <p className="font-medium" style={{ color: '#000000' }}>No persistent files yet</p>
              <p className="text-sm mt-1" style={{ color: '#000000' }}>
                Check "Keep Persistent" when uploading to save files here
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 font-semibold" style={{ color: '#000000' }}>Name</th>
                  <th className="text-left py-3 px-2 font-semibold" style={{ color: '#000000' }}>Format</th>
                  <th className="text-left py-3 px-2 font-semibold" style={{ color: '#000000' }}>Size</th>
                  <th className="text-left py-3 px-2 font-semibold" style={{ color: '#000000' }}>Created</th>
                  <th className="text-right py-3 px-2 font-semibold" style={{ color: '#000000' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-2">
                      {editingId === file.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="flex-1 px-2 py-1 border border-slate-300 rounded font-medium"
                            style={{ color: '#000000' }}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveEdit(file.id)
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                          />
                          <button
                            onClick={() => handleSaveEdit(file.id)}
                            className="p-1 hover:bg-green-100 rounded text-green-600"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-medium" style={{ color: '#000000' }}>{file.display_name}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <span className="flex items-center gap-1" style={{ color: '#000000' }}>
                        {getFormatIcon(file.format)}
                        {file.format || 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-2" style={{ color: '#000000' }}>{formatSize(file.size_mb)}</td>
                    <td className="py-3 px-2 text-sm" style={{ color: '#000000' }}>{formatDate(file.created_at)}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCopyUrl(file.download_url, file.id)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors group relative"
                          title="Copy URL"
                        >
                          {copySuccess === file.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" style={{ color: '#000000' }} />
                          )}
                        </button>
                        <a
                          href={file.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Open URL"
                        >
                          <ExternalLink className="h-4 w-4" style={{ color: '#000000' }} />
                        </a>
                        <button
                          onClick={() => handleStartEdit(file)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Rename"
                        >
                          <Edit2 className="h-4 w-4" style={{ color: '#000000' }} />
                        </button>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-slate-200 text-base space-y-2" style={{ color: '#000000' }}>
          <p>
            {userRole === 'admin'
              ? 'Persistent files are kept permanently and won\'t be automatically deleted.'
              : 'Persistent files are kept for 7 days and then automatically deleted.'}
          </p>
          <p>
            <strong>Note:</strong> Renaming only changes the display name for ease of use. Backend filenames remain unchanged (original name + unique ID for CSV/Parquet, table-based name + unique ID for DuckDB files).
          </p>
        </div>
      </div>
    </div>
  )
}
