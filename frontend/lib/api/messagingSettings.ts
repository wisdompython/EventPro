import { request } from './request'
import type {
  MessagingSettingsAuditEntry,
  MessagingSettingsPayload,
  MessagingSettingsUpdate,
} from './types'

export const messagingSettingsApi = {
  getMessagingSettings: () =>
    request<MessagingSettingsPayload>('/auth/messaging-settings/'),

  /**
   * Send only the fields being changed. A null value clears the workspace's
   * override so the field falls back to the platform default.
   */
  updateMessagingSettings: (payload: MessagingSettingsUpdate) =>
    request<MessagingSettingsPayload>('/auth/messaging-settings/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getMessagingSettingsAudit: () =>
    request<MessagingSettingsAuditEntry[]>('/auth/messaging-settings/audit/'),
}
