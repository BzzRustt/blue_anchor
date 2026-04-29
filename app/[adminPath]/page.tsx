import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getAdminPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import LoginForm from '@/components/LoginForm'
import AdminTabs from '@/components/AdminTabs'
import AnalyticsTab from '@/components/tabs/AnalyticsTab'
import ResponsesTab from '@/components/tabs/ResponsesTab'
import EditProfileTab from '@/components/tabs/EditProfileTab'

export const dynamic = 'force-dynamic'

interface Props {
  params: { adminPath: string }
}

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-accent animate-spin" />
    </div>
  )
}

export default async function AdminPage({ params }: Props) {
  const adminPath = getAdminPath()

  if (!adminPath || params.adminPath !== adminPath) {
    notFound()
  }

  const cookieStore = cookies()
  const isAuthenticated = !!cookieStore.get('admin_session')?.value

  if (!isAuthenticated) {
    return <LoginForm />
  }

  // Fetch test_mode to seed the toggle's initial state
  const supabase = createAdminClient()
  const { data: profileData } = await supabase
    .from('profiles')
    .select('test_mode')
    .maybeSingle()
  const initialTestMode = (profileData as { test_mode?: boolean } | null)?.test_mode === true

  return (
    <AdminTabs
      initialTestMode={initialTestMode}
      analyticsContent={
        <Suspense fallback={<TabSpinner />}>
          <AnalyticsTab />
        </Suspense>
      }
      responsesContent={
        <Suspense fallback={<TabSpinner />}>
          <ResponsesTab />
        </Suspense>
      }
      editProfileContent={<EditProfileTab />}
    />
  )
}
