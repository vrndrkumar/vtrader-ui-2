export interface BrokerMaster {
  id: number
  name: string
  is_active: number
}

export interface BrokerInfo {
  userId: string
  password: string
  vendorCode: string
  apiKey: string
  secretKey: string
  twoFAKey: string
  IPAddress?: string
  imei: string
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
  brokerName: string
  brokerInfo: BrokerInfo
  isActive: boolean
  preferences?: BrokerPreferences
  createdAt?: string
  updatedAt?: string
}

export interface AddBrokerPayload {
  brokerName: string
  brokerInfo: BrokerInfo
  isActive: boolean
  preferences: BrokerPreferences
}

export type UpdateBrokerPayload = AddBrokerPayload

export interface ValidateBrokerPayload {
  brokerName: string
  brokerInfo: BrokerInfo
}

export interface ValidateBrokerResponse {
  success?: boolean
  message?: string
  data?: unknown
}
