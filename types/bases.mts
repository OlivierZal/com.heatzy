export interface CapabilitiesOptionsValues<T extends string> {
  readonly id: T
  readonly title: string | LocalizedStrings
}

export interface LocalizedStrings extends Partial<Record<string, string>> {
  readonly en: string
}
