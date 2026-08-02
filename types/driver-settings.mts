interface DriverSettingValue {
  readonly id: string
  readonly label: string
}

export interface DriverSetting {
  readonly driverId: string
  readonly driverLabel: string
  readonly id: string
  readonly title: string
  readonly type: string
  readonly groupId?: string | undefined
  readonly groupLabel?: string
  readonly max?: number | undefined
  readonly min?: number | undefined
  readonly placeholder?: string
  readonly units?: string | undefined
  readonly values?: readonly DriverSettingValue[] | undefined
}
