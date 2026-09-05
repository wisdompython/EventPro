import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}

export function AdminPageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <header className="admin-page__header">
      <div className="admin-page__identity">
        <p className="admin-page__eyebrow">{eyebrow}</p>
        <h1 className="admin-page__title">{title}</h1>
        {description && <p className="admin-page__description">{description}</p>}
      </div>
      {actions && <div className="admin-page__actions">{actions}</div>}
    </header>
  )
}
