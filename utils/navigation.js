const TAB_ROOTS = ['/pages/index/index', '/pages/chat/index', '/pages/profile/index']

function normalizeUrl(url) {
  if (!url) return ''
  return url.startsWith('/') ? url : '/' + url
}

function getUrlPath(url) {
  const normalized = normalizeUrl(url)
  const idx = normalized.indexOf('?')
  return idx >= 0 ? normalized.slice(0, idx) : normalized
}

function isTabRoute(url) {
  return TAB_ROOTS.includes(getUrlPath(url))
}

function getCurrentTabRoot() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (!pages.length) return '/pages/index/index'

  const root = '/' + (pages[0].route || '')
  if (TAB_ROOTS.includes(root)) {
    return root
  }
  return '/pages/index/index'
}

function openPage(url) {
  const normalized = normalizeUrl(url)
  if (!normalized) return

  if (isTabRoute(normalized)) {
    wx.switchTab({ url: getUrlPath(normalized) })
    return
  }

  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length >= 2) {
    wx.redirectTo({ url: normalized })
    return
  }

  wx.navigateTo({ url: normalized })
}

function backToCurrentTabRoot() {
  wx.switchTab({ url: getCurrentTabRoot() })
}

module.exports = {
  TAB_ROOTS,
  getCurrentTabRoot,
  openPage,
  backToCurrentTabRoot,
  isTabRoute,
}
