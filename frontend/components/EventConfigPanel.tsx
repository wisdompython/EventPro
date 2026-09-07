'use client'

import { TicketTypesSection } from '@/components/event-config/TicketTypesSection'
import { RequiredFieldsSection } from '@/components/event-config/RequiredFieldsSection'
import { WhatsAppToggle } from '@/components/event-config/WhatsAppToggle'
import { AsoEbiToggle } from '@/components/event-config/AsoEbiToggle'
import { PlusOneToggle } from '@/components/event-config/PlusOneToggle'
import { CelebrantPreferences } from '@/components/event-config/CelebrantPreferences'
import { PreferencesOnlyToggle } from '@/components/event-config/PreferencesOnlyToggle'

export interface TicketTypeDef {
  value: string
  label: string
}

export const CONFIGURABLE_FIELDS = [
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'email',        label: 'Email Address' },
  { key: 'table_number', label: 'Table Number' },
  { key: 'seat_number',  label: 'Seat Number' },
] as const

export type ConfigurableField = typeof CONFIGURABLE_FIELDS[number]['key']

interface Props {
  ticketTypes:    TicketTypeDef[]
  requiredFields: string[]
  whatsappEnabled: boolean
  collectAsoEbi: boolean
  allowPlusOne: boolean
  plusOneLabel: string
  asoEbiLabel: string
  asoEbiUnit: string
  preferencesEnabled: boolean
  collectCelebrant: boolean
  celebrantOptions: string[]
  lockWhatsApp?: boolean
  showPreferencesToggle?: boolean
  showGuestPreferenceOptions?: boolean
  onChange: (patch: {
    ticketTypes?:    TicketTypeDef[]
    requiredFields?: string[]
    whatsappEnabled?: boolean
    collectAsoEbi?: boolean
    allowPlusOne?: boolean
    plusOneLabel?: string
    asoEbiLabel?: string
    asoEbiUnit?: string
    preferencesEnabled?: boolean
    collectCelebrant?: boolean
    celebrantOptions?: string[]
  }) => void
}

export default function EventConfigPanel({
  ticketTypes, requiredFields, whatsappEnabled, collectAsoEbi, allowPlusOne,
  plusOneLabel, asoEbiLabel, asoEbiUnit,
  preferencesEnabled, collectCelebrant, celebrantOptions, onChange,
  lockWhatsApp = false, showPreferencesToggle = true, showGuestPreferenceOptions = true,
}: Props) {
  function toggleField(key: string) {
    const next = requiredFields.includes(key)
      ? requiredFields.filter((f) => f !== key)
      : [...requiredFields, key]
    onChange({ requiredFields: next })
  }

  return (
    <div className="space-y-6">
      <TicketTypesSection
        ticketTypes={ticketTypes}
        onChange={(types) => onChange({ ticketTypes: types })}
      />
      <RequiredFieldsSection
        requiredFields={requiredFields}
        whatsappEnabled={whatsappEnabled}
        onToggle={toggleField}
      />
      {showPreferencesToggle && <div>
        <p className="mb-1 text-sm font-semibold text-[var(--ink)]">Guest response channel</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Open a standalone form only when guests need to submit choices outside RSVP.</p>
        <PreferencesOnlyToggle enabled={preferencesEnabled} onChange={(enabled) => onChange({ preferencesEnabled: enabled })} />
      </div>}
      {showGuestPreferenceOptions && <div>
        <p className="mb-1 text-sm font-semibold text-[var(--ink)]">Guest preferences</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Enable only the guest choices and services that apply to this event.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <PlusOneToggle
            enabled={allowPlusOne}
            label={plusOneLabel}
            onChange={(enabled) => onChange({ allowPlusOne: enabled })}
            onLabelChange={(label) => onChange({ plusOneLabel: label })}
          />
          <AsoEbiToggle
            enabled={collectAsoEbi}
            label={asoEbiLabel}
            unit={asoEbiUnit}
            onChange={(enabled) => onChange({ collectAsoEbi: enabled })}
            onLabelChange={(label) => onChange({ asoEbiLabel: label })}
            onUnitChange={(unit) => onChange({ asoEbiUnit: unit })}
          />
          <CelebrantPreferences enabled={collectCelebrant} options={celebrantOptions} onChange={(patch) => onChange({ collectCelebrant: patch.enabled, celebrantOptions: patch.options })} />
        </div>
      </div>}
      <div>
        <p className="mb-1 text-sm font-semibold text-[var(--ink)]">Guest communication</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Choose whether this event uses WhatsApp for guest messages and passes.</p>
        <WhatsAppToggle
          whatsappEnabled={whatsappEnabled}
          locked={lockWhatsApp}
          onChange={(enabled) => onChange({ whatsappEnabled: enabled })}
        />
      </div>
    </div>
  )
}
