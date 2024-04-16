import type APICallContextData from './APICallContextData'
import APICallRequestData from './APICallRequestData'
import APICallResponseData from './APICallResponseData'
import type { AxiosError } from 'axios'
import type { ErrorData } from '../types'

interface APICallContextDataWithErrorMessage extends APICallContextData {
  readonly errorMessage: string
}

const getMessage = (error: AxiosError): string => {
  const data = error.response?.data as ErrorData | null | undefined
  if (typeof data !== 'undefined' && data) {
    const { error_message: errorMessage, detail_message: detailMessage } = data
    const message = detailMessage ?? errorMessage ?? ''
    if (message) {
      return message
    }
  }
  return error.message
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withErrorMessage = <T extends new (...args: any[]) => APICallContextData>(
  base: T,
  error: AxiosError,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): new (...args: any[]) => APICallContextDataWithErrorMessage =>
  class extends base {
    public readonly errorMessage = getMessage(error)
  }

const createAPICallErrorData = (
  error: AxiosError,
): APICallContextDataWithErrorMessage =>
  typeof error.response === 'undefined' ?
    new (withErrorMessage(APICallRequestData, error))(error.config)
  : new (withErrorMessage(APICallResponseData, error))(error.response)

export default createAPICallErrorData
