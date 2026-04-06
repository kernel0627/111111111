const { openPage } = require('../../utils/navigation')
const { listPosts, reportFeedExposures, reportFeedClick } = require('../../utils/postApi')

const SESSION_KEY = 'zgbe_feed_session'
const CATEGORY_MAP = {
  全部: [],
  学习: ['自习', '编程', '英语', '读书'],
  运动: ['跑步', '骑行', '篮球', '羽毛球'],
  娱乐: ['电影', 'KTV', '桌游', '逛展'],
  其他: ['探店', '宠物', '志愿', '摄影'],
}

function getFeedSessionId() {
  try {
    let sessionId = wx.getStorageSync(SESSION_KEY)
    if (sessionId) return sessionId
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10)
    wx.setStorageSync(SESSION_KEY, sessionId)
    return sessionId
  } catch (e) {
    return 'session_' + Date.now()
  }
}

function toRadians(value) {
  return value * Math.PI / 180
}

function distanceBetween(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER
  const earthRadius = 6371
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
  const y = Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(x + y), Math.sqrt(1 - x - y))
  return earthRadius * c
}

function buildLocationButtonText(address) {
  const value = String(address || '').trim()
  if (!value) return '地点'
  return value.length > 6 ? (value.slice(0, 6) + '...') : value
}

Page({
  data: {
    categories: ['全部', '学习', '运动', '娱乐', '其他'],
    activeCategory: '全部',
    subCategories: [],
    activeSubCategory: '',
    sortBy: 'hot',
    keyword: '',
    addressFilter: '',
    posts: [],
    page: 1,
    pageSize: 10,
    hasMore: false,
    nextPage: 0,
    loading: false,
    loadingMore: false,
    errorText: '',
    userCoords: null,
    showLocationSheet: false,
    showManualLocationDialog: false,
    manualLocationText: '',
    locationButtonText: '地点',
  },

  onLoad() {
    this.refreshList(true)
  },

  onPullDownRefresh() {
    this.refreshList(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.refreshList(false)
    }
  },

  currentQuery(page) {
    return {
      sortBy: this.data.sortBy === 'latest' ? 'latest' : 'hot',
      category: this.data.activeCategory !== '全部' ? this.data.activeCategory : '',
      subCategory: this.data.activeSubCategory || '',
      keyword: (this.data.keyword || '').trim(),
      addressKeyword: (this.data.addressFilter || '').trim(),
      page,
      pageSize: this.data.pageSize,
    }
  },

  refreshList(reset) {
    const page = reset ? 1 : (this.data.nextPage || (this.data.page + 1))
    this._requestId = (this._requestId || 0) + 1
    const requestId = this._requestId

    this.setData({
      loading: reset,
      loadingMore: !reset,
      errorText: reset ? '' : this.data.errorText,
    })

    return listPosts(this.currentQuery(page))
      .then((res) => {
        if (requestId !== this._requestId) return

        let posts = Array.isArray(res.posts) ? res.posts.slice() : []
        if (this.data.sortBy === 'nearby' && this.data.userCoords) {
          const coords = this.data.userCoords
          posts = posts.slice().sort((left, right) => distanceBetween(coords, left.coords) - distanceBetween(coords, right.coords))
        }

        const baseOffset = reset ? 0 : this.data.posts.length
        const feedRequestId = res.feedRequestId || ''
        const decorated = posts.map((post, index) => Object.assign({}, post, {
          _feedRequestId: feedRequestId,
          _position: baseOffset + index + 1,
        }))
        const nextPosts = reset ? decorated : this.data.posts.concat(decorated)

        this.setData({
          posts: nextPosts,
          page: res.page || page,
          pageSize: res.pageSize || this.data.pageSize,
          hasMore: !!res.hasMore,
          nextPage: res.nextPage || 0,
          loading: false,
          loadingMore: false,
          errorText: '',
        })

        if (decorated.length && feedRequestId) {
          reportFeedExposures({
            feedRequestId,
            sessionId: getFeedSessionId(),
            items: decorated.map((item) => ({
              postId: item.id,
              position: item._position,
              strategy: this.data.sortBy === 'latest' ? 'latest' : 'personalized',
              score: item.recommendation && item.recommendation.score ? item.recommendation.score : 0,
            })),
          }).catch(() => null)
        }
      })
      .catch((err) => {
        if (requestId !== this._requestId) return
        this.setData({
          loading: false,
          loadingMore: false,
          posts: reset ? [] : this.data.posts,
          errorText: (err && err.message) || '加载活动失败，请稍后重试',
        })
      })
  },

  onCategoryChange(e) {
    const category = e.detail.category || '全部'
    this.setData({
      activeCategory: category,
      subCategories: CATEGORY_MAP[category] || [],
      activeSubCategory: '',
    })
    this.refreshList(true)
  },

  onSubCategoryChange(e) {
    this.setData({ activeSubCategory: e.detail.subCategory || '' })
    this.refreshList(true)
  },

  onSortChange(e) {
    const sortBy = e.detail.sortBy || 'hot'
    this.setData({ sortBy })
    this.refreshList(true)
  },

  onKeywordInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' })
  },

  onKeywordConfirm() {
    this.refreshList(true)
  },

  onLocationFilterTap() {
    this.setData({ showLocationSheet: true })
  },

  onLocationSheetClose() {
    this.setData({ showLocationSheet: false })
  },

  onUseCurrentLocation() {
    this.setData({ showLocationSheet: false })
    wx.showToast({ title: '定位功能暂未启用，请先手写地点', icon: 'none' })
  },

  onManualLocationTap() {
    this.setData({
      showLocationSheet: false,
      showManualLocationDialog: true,
      manualLocationText: this.data.addressFilter || '',
    })
  },

  onManualLocationInput(e) {
    this.setData({ manualLocationText: (e.detail && e.detail.value) || '' })
  },

  onManualLocationCancel() {
    this.setData({ showManualLocationDialog: false })
  },

  onManualLocationConfirm() {
    const addressFilter = (this.data.manualLocationText || '').trim()
    this.setData({
      addressFilter,
      locationButtonText: buildLocationButtonText(addressFilter),
      showManualLocationDialog: false,
    })
    this.refreshList(true)
  },

  onClearLocationFilter() {
    this.setData({
      addressFilter: '',
      manualLocationText: '',
      locationButtonText: '地点',
      showLocationSheet: false,
      showManualLocationDialog: false,
    })
    this.refreshList(true)
  },

  onPostCardTap(e) {
    const detail = e.detail || {}
    const post = detail.post || (this.data.posts || []).find((item) => item.id === detail.postId)
    if (!post || !post.id) return

    if (post._feedRequestId) {
      reportFeedClick({
        feedRequestId: post._feedRequestId,
        sessionId: getFeedSessionId(),
        postId: post.id,
        position: post._position || 1,
        strategy: this.data.sortBy === 'latest' ? 'latest' : 'personalized',
        score: post.recommendation && post.recommendation.score ? post.recommendation.score : 0,
      }).catch(() => null)
    }

    openPage('/pages/detail/index?id=' + post.id)
  },

  onCreatePost() {
    openPage('/pages/post/index')
  },

  onChatTap() {
    wx.switchTab({ url: '/pages/chat/index' })
  },
})
