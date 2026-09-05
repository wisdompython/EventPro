import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create your workspace',
  description: 'Create an Event Pro account and your first event workspace.',
  robots: { index: false, follow: false },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
