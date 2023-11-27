export const isFirstGen = (productKey: string): boolean =>
  productKey === '9420ae048da545c88fc6274d204dd25f'

export const isFirstPilot = (productName: string): boolean =>
  productName === 'Pilote_Soc'

export const isGlow = (productKey: string): boolean =>
  [
    '2fd622e45283470f9e27e8e6167d7533',
    'cffa0df68a52449085c5d1e72c2f6bb0',
  ].includes(productKey)
