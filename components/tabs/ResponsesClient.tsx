'use client'

import { useState } from 'react'
import type { Response as ScanResponse } from '@/types/database'

function formatRelativeTime(iso: string): string {
  const submitted = new Date(iso)
  const now = new Date()

  const submittedDay = new Date(
    Date.UTC(submitted.getFullYear(), submitted.getMonth(), submitted.getDate())
  )
  const todayDay = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  )

  const diffDays = Math.round(
    (todayDay.getTime() - submittedDay.getTime()) / 86_400_000
  )

  const time = submitted.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Yesterday, ${time}`
  return `${diffDays} days ago`
}

interface CommentCardProps {
  response: ScanResponse
  onDelete: (id: string) => void
}

function CommentCard({ response, onDelete }: CommentCardProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/responses/${response.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete(response.id)
      } else {
        setDeleting(false)
      }
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      className={[
        'bg-white border border-gray-200 rounded-xl p-5 transition-opacity duration-300',
        deleting ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-gray-800">
            {response.commenter_name?.trim() || 'Anonymous'}
          </span>
          <span className="ml-2 text-xs text-gray-400">
            {formatRelativeTime(response.submitted_at)}
          </span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
        {response.comment}
      </p>
    </div>
  )
}

interface Props {
  initialComments: ScanResponse[]
}

export default function ResponsesClient({ initialComments }: Props) {
  const [comments, setComments] = useState(initialComments)

  function removeComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  if (comments.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        No comments yet — get out there and wear the shirt.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <CommentCard key={c.id} response={c} onDelete={removeComment} />
      ))}
    </div>
  )
}
