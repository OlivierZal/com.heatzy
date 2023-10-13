import BaseHeatzyDevice from '../../bases/device'
import type { FirstGenDevicePostData, Mode } from '../../types'

export = class HeatzyFirstGenDevice extends BaseHeatzyDevice {
  protected buildPostDataMode(mode: Mode): FirstGenDevicePostData {
    return { raw: [1, 1, this.modeToNumber[mode]] }
  }

  protected async handleSuccess(
    success: boolean,
    postData: FirstGenDevicePostData,
  ): Promise<void> {
    if (success) {
      await this.updateCapabilities({ mode: postData.raw[2] })
    }
  }
}
