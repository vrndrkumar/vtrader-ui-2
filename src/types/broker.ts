export interface BrokerMaster {
  id: number
  name: string
  is_active: number
}

export type LoginSource = 'WEB' | 'API'

export interface BrokerInfo {
  loginSource?: LoginSource
  userId: string
  password: string
  vendorCode: string
  apiKey: string
  secretKey: string
  twoFAKey: string
  IPAddress?: string
  ipType?: string
  imei: string
  appkey?: string
}

export type BrokerQuantity = Record<string, number>

export interface BrokerPreferences {
  default: boolean
  quantity: BrokerQuantity
  brokerName?: string
  displayName?: string
}

/** Matches actual API response (camelCase) */
export interface UserBroker {
  id: number
  userId: number
  brokerId?: number
  broker_id?: number
  brokerName: string
  brokerInfo: BrokerInfo
  isActive: boolean
  status?: string | null        // admin approval lifecycle: 'APPROVED' | null (pending) | …
  broker?: { id: number; name: string; isActive?: boolean }   // master broker (admin list)
  preferences?: BrokerPreferences
  createdAt?: string
  updatedAt?: string
}

/** Body for POST /broker/admin/approve/:id — admin sets ipType + IPAddress, then approves. */
export interface ApproveBrokerPayload {
  brokerInfo: BrokerInfo
  brokerId: number
  status: string                // 'APPROVED' | 'REJECTED'
}

/**
 * Request body for POST /broker and PUT /broker/:id.
 * Add identifies the broker by name (the numeric id is created server-side);
 * update sends the created brokerId. Both carry brokerInfo + preferences.
 */
export interface BrokerUpsertPayload {
  brokerName?: string
  brokerId?: number
  brokerInfo: BrokerInfo
  preferences: BrokerPreferences
  isActive?: boolean
}

export type AddBrokerPayload = BrokerUpsertPayload
export type UpdateBrokerPayload = BrokerUpsertPayload

export interface ValidateBrokerPayload {
  brokerId: number
  brokerInfo: BrokerInfo
}

export interface ValidateBrokerResponse {
  success?: boolean
  message?: string
  data?: unknown
}
