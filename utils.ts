export function isFirstGen(productKey: string): boolean {
  return productKey === '9420ae048da545c88fc6274d204dd25f'
}

export function isFirstPilot(productName: string | undefined): boolean {
  return productName === undefined || productName === 'Pilote_SoC'
}

export function isGlow(productKey: string): boolean {
  return [
    '2fd622e45283470f9e27e8e6167d7533',
    'cffa0df68a52449085c5d1e72c2f6bb0',
  ].includes(productKey)
}
