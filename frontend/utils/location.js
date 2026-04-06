function getCurrentLocation() {
  return new Promise(function(resolve, reject) {
    wx.getLocation({
      type: 'gcj02',
      timeout: 8000,
      isHighAccuracy: false,
      success: function(res) {
        resolve({
          latitude: res.latitude,
          longitude: res.longitude,
          address: '当前位置',
        })
      },
      fail: function(err) {
        const errMsg = (err && err.errMsg) || ''
        if (errMsg.indexOf('timeout') !== -1) {
          reject({ code: 'LOCATION_TIMEOUT', errMsg })
          return
        }
        reject({ code: 'LOCATION_FAIL', errMsg: errMsg || '定位失败' })
      },
    })
  })
}

module.exports = { getCurrentLocation }
